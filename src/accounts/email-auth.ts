import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  randomUUID,
  scrypt,
  timingSafeEqual,
} from 'node:crypto'
import type { EmailSender } from '../../api/core/email.js'
import type { VerdunAccount, VerdunIdentityProvider } from './account-types.js'
import {
  hashVerdunSessionToken,
  verdunAccountFromRow,
  type VerdunAccountRow,
  type VerdunAccountSql,
} from './store.js'
import { verdunDefaultSessionMaxAgeSeconds } from './http.js'

export const verdunEmailChallengePurposes = [
  'verify_email',
  'passwordless_login',
  'password_reset',
] as const

export type VerdunEmailChallengePurpose = typeof verdunEmailChallengePurposes[number]

export type VerdunEmailProof =
  | { kind: 'code', code: string }
  | { kind: 'link', token: string }

export type VerdunEmailChallenge = {
  id: string
  purpose: VerdunEmailChallengePurpose
  email: string
  token: string
  code: string
  createdAt: string
  expiresAt: string
}

export type VerdunEmailChallengeRequest = {
  purpose: VerdunEmailChallengePurpose
  email: string
  authPepper: string
  password?: string
  ipAddress: string
  expiresInSeconds?: number
  maxAttempts?: number
}

export type VerdunEmailChallengeCompletion = {
  challengeId: string
  purpose: VerdunEmailChallengePurpose
  proof: VerdunEmailProof
  authPepper: string
  ipAddress: string
  adminEmails?: Iterable<string>
  newPassword?: string
  sessionMaxAgeSeconds?: number
}

export type VerdunEmailPasswordAuthentication = {
  email: string
  password: string
  authPepper: string
  ipAddress: string
  sessionMaxAgeSeconds?: number
}

export type VerdunAuthenticationResult = {
  account: VerdunAccount
  sessionToken: string
}

export type VerdunAccountIdentity = {
  provider: VerdunIdentityProvider
  email: string
  verifiedAt: string
  lastUsedAt: string | null
  hasPassword: boolean
}

export type VerdunEmailDeliveryOptions = {
  appName: string
  appUrl: string
  completionPath?: string
}

export type VerdunAuthRateLimit = {
  scope: string
  key: string
  authPepper: string
  limit: number
  windowSeconds: number
}

export const verdunDefaultEmailChallengeLifetimeSeconds = 10 * 60
export const verdunDefaultEmailChallengeMaxAttempts = 5
export const verdunMinimumPasswordLength = 10
export const verdunMaximumPasswordLength = 1024

const scryptCost = 32_768
const scryptBlockSize = 8
const scryptParallelization = 1
const scryptKeyLength = 32
const scryptMaxMemory = 64 * 1024 * 1024
let dummyPasswordHashPromise: Promise<string> | undefined

export function normalizeVerdunEmail(value: string): string {
  const email = value.trim().toLowerCase()
  const at = email.lastIndexOf('@')
  if (
    !email ||
    email.length > 254 ||
    at <= 0 ||
    at > 64 ||
    email.indexOf('@') !== at ||
    !email.slice(at + 1).includes('.') ||
    /\s/.test(email)
  ) {
    throw new Error('invalid_email')
  }
  return email
}

export function assertVerdunAuthPepper(value: string): string {
  const pepper = value.trim()
  if (pepper.length < 32) throw new Error('auth_pepper_not_configured')
  return pepper
}

export function assertVerdunPassword(value: string): string {
  if (value.length < verdunMinimumPasswordLength || value.length > verdunMaximumPasswordLength) {
    throw new Error('invalid_password')
  }
  return value
}

export async function hashVerdunPassword(password: string): Promise<string> {
  assertVerdunPassword(password)
  const salt = randomBytes(16)
  const derivedKey = await scryptKey(password, salt, scryptCost, scryptBlockSize, scryptParallelization)
  return [
    'scrypt',
    String(scryptCost),
    String(scryptBlockSize),
    String(scryptParallelization),
    salt.toString('base64url'),
    derivedKey.toString('base64url'),
  ].join('$')
}

export async function verifyVerdunPassword(password: string, encodedHash: string): Promise<boolean> {
  const parts = encodedHash.split('$')
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false
  const cost = Number(parts[1])
  const blockSize = Number(parts[2])
  const parallelization = Number(parts[3])
  if (
    cost !== scryptCost ||
    blockSize !== scryptBlockSize ||
    parallelization !== scryptParallelization
  ) return false

  let salt: Buffer
  let expected: Buffer
  try {
    salt = Buffer.from(parts[4], 'base64url')
    expected = Buffer.from(parts[5], 'base64url')
  } catch {
    return false
  }
  if (salt.length !== 16 || expected.length !== scryptKeyLength) return false
  const actual = await scryptKey(password, salt, cost, blockSize, parallelization)
  return timingSafeEqual(actual, expected)
}

export function hashVerdunEmailLinkToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function hashVerdunEmailCode(challengeId: string, code: string, authPepper: string): string {
  return createHmac('sha256', assertVerdunAuthPepper(authPepper))
    .update(`${challengeId}:${code}`)
    .digest('hex')
}

export async function enforceVerdunAuthRateLimit(
  sql: VerdunAccountSql,
  options: VerdunAuthRateLimit,
): Promise<number> {
  const scope = options.scope.trim()
  const key = options.key.trim()
  const limit = Math.floor(options.limit)
  const windowSeconds = Math.floor(options.windowSeconds)
  if (!scope || !key || limit <= 0 || windowSeconds <= 0) throw new Error('invalid_auth_rate_limit')
  const keyHash = createHmac('sha256', assertVerdunAuthPepper(options.authPepper))
    .update(`${scope}:${key}`)
    .digest('hex')
  const windowMilliseconds = windowSeconds * 1000
  const bucketStart = new Date(Math.floor(Date.now() / windowMilliseconds) * windowMilliseconds)
  const expiresAt = new Date(bucketStart.getTime() + windowMilliseconds * 2)
  const rows = await sql.query(
    `insert into verdun_auth_rate_bucket (
       scope,
       key_hash,
       bucket_start,
       attempts,
       expires_at
     ) values ($1, $2, $3, 1, $4)
     on conflict (scope, key_hash, bucket_start)
     do update set attempts = verdun_auth_rate_bucket.attempts + 1
     where verdun_auth_rate_bucket.attempts < $5
     returning attempts`,
    [scope, keyHash, bucketStart.toISOString(), expiresAt.toISOString(), limit],
  ) as Array<{ attempts: number }>
  if (!rows[0]) throw new Error('auth_rate_limited')
  return Number(rows[0].attempts)
}

export async function requestVerdunEmailChallenge(
  sql: VerdunAccountSql,
  options: VerdunEmailChallengeRequest,
): Promise<VerdunEmailChallenge | null> {
  const purpose = assertChallengePurpose(options.purpose)
  const email = normalizeVerdunEmail(options.email)
  const authPepper = assertVerdunAuthPepper(options.authPepper)
  const expiresInSeconds = boundedInteger(
    options.expiresInSeconds,
    verdunDefaultEmailChallengeLifetimeSeconds,
    60,
    60 * 60,
    'invalid_email_challenge_lifetime',
  )
  const maxAttempts = boundedInteger(
    options.maxAttempts,
    verdunDefaultEmailChallengeMaxAttempts,
    1,
    10,
    'invalid_email_challenge_attempts',
  )
  if (purpose !== 'verify_email' && options.password !== undefined) {
    throw new Error('email_challenge_password_not_allowed')
  }

  await enforceVerdunAuthRateLimit(sql, {
    scope: 'email_challenge:email',
    key: email,
    authPepper,
    limit: 3,
    windowSeconds: 15 * 60,
  })
  await enforceVerdunAuthRateLimit(sql, {
    scope: 'email_challenge:ip',
    key: options.ipAddress,
    authPepper,
    limit: 10,
    windowSeconds: 15 * 60,
  })
  const pendingPasswordHash = purpose === 'verify_email'
    ? await hashVerdunPassword(assertVerdunPassword(options.password ?? ''))
    : null

  const id = randomUUID()
  const token = randomBytes(32).toString('base64url')
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0')
  const rows = await sql.query(
    `select *
     from verdun_issue_email_challenge(
       $1::uuid,
       $2,
       $3,
       $4,
       $5,
       $6,
       $7,
       $8
     )`,
    [
      id,
      purpose,
      email,
      hashVerdunEmailLinkToken(token),
      hashVerdunEmailCode(id, code, authPepper),
      pendingPasswordHash,
      maxAttempts,
      expiresInSeconds,
    ],
  ) as Array<{
    id: string
    purpose: VerdunEmailChallengePurpose
    email: string
    created_at: string
    expires_at: string
  }>
  const row = rows[0]
  if (!row) return null
  return {
    id: row.id,
    purpose: row.purpose,
    email: row.email,
    token,
    code,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  }
}

export function buildVerdunEmailChallengeLink(
  challenge: VerdunEmailChallenge,
  options: VerdunEmailDeliveryOptions,
): string {
  const baseUrl = new URL(options.appUrl)
  const completionUrl = new URL(options.completionPath ?? '/', baseUrl)
  if (!['https:', 'http:'].includes(completionUrl.protocol)) throw new Error('invalid_email_challenge_url')
  completionUrl.hash = new URLSearchParams({
    auth_challenge: challenge.id,
    auth_token: challenge.token,
    auth_purpose: challenge.purpose,
  }).toString()
  return completionUrl.toString()
}

export async function deliverVerdunEmailChallenge(
  sql: VerdunAccountSql,
  sender: EmailSender,
  challenge: VerdunEmailChallenge,
  options: VerdunEmailDeliveryOptions,
): Promise<void> {
  const appName = options.appName.trim()
  if (!appName || /[\r\n]/.test(appName)) throw new Error('email_app_name_required')
  const link = buildVerdunEmailChallengeLink(challenge, options)
  const action = emailChallengeAction(challenge.purpose)
  const lifetimeMinutes = Math.max(
    1,
    Math.round((Date.parse(challenge.expiresAt) - Date.parse(challenge.createdAt)) / 60_000),
  )
  const subject = `${challenge.code} is your ${appName} verification code`
  const text = [
    `${action} in ${appName}.`,
    '',
    `Verification code: ${challenge.code}`,
    '',
    `Or open this one-time link: ${link}`,
    '',
    `The code and link expire in ${lifetimeMinutes} minutes and either one can be used once.`,
    `If you did not request this, you can ignore this email.`,
  ].join('\n')
  const html = [
    `<p>${escapeHtml(action)} in ${escapeHtml(appName)}.</p>`,
    `<p>Verification code:</p><p style="font-size:28px;font-weight:700;letter-spacing:0.14em">${challenge.code}</p>`,
    `<p><a href="${escapeHtml(link)}">Continue to ${escapeHtml(appName)}</a></p>`,
    `<p>The code and link expire in ${lifetimeMinutes} minutes and either one can be used once.</p>`,
    '<p>If you did not request this, you can ignore this email.</p>',
  ].join('')
  try {
    await sender({
      to: challenge.email,
      subject,
      text,
      html,
      headers: { 'X-Entity-Ref-ID': challenge.id },
    })
    await markVerdunEmailChallengeDelivery(sql, challenge.id, 'sent')
  } catch (error) {
    await markVerdunEmailChallengeDelivery(sql, challenge.id, 'failed').catch(() => undefined)
    throw error
  }
}

export async function completeVerdunEmailChallenge(
  sql: VerdunAccountSql,
  options: VerdunEmailChallengeCompletion,
): Promise<VerdunAuthenticationResult> {
  const challengeId = options.challengeId.trim()
  const purpose = assertChallengePurpose(options.purpose)
  const authPepper = assertVerdunAuthPepper(options.authPepper)
  if (!isUuid(challengeId)) throw new Error('email_challenge_invalid')
  if (options.proof.kind !== 'link' && options.proof.kind !== 'code') {
    throw new Error('email_challenge_invalid')
  }
  const proofHash = options.proof.kind === 'link'
    ? hashVerdunEmailLinkToken(options.proof.token.trim())
    : hashVerdunEmailCode(challengeId, assertEmailCode(options.proof.code), authPepper)
  if (options.proof.kind === 'link' && !options.proof.token.trim()) throw new Error('email_challenge_invalid')

  await enforceVerdunAuthRateLimit(sql, {
    scope: 'email_challenge_completion:ip',
    key: options.ipAddress,
    authPepper,
    limit: 30,
    windowSeconds: 15 * 60,
  })

  if (purpose !== 'password_reset' && options.newPassword !== undefined) {
    throw new Error('email_challenge_password_not_allowed')
  }
  const sessionMaxAgeSeconds = boundedInteger(
    options.sessionMaxAgeSeconds,
    verdunDefaultSessionMaxAgeSeconds,
    60,
    60 * 60 * 24 * 365,
    'invalid_session_lifetime',
  )
  const sessionToken = randomBytes(32).toString('base64url')
  const adminEmails = [...new Set(
    Array.from(options.adminEmails ?? [])
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  )]

  type CompletionRow = {
    proof_valid: boolean
    challenge_attempts: number
    account_row: VerdunAccountRow | null
  }
  const completionParams = (
    passwordHash: string | null,
    tokenHash: string,
  ): [string, VerdunEmailChallengePurpose, 'link' | 'code', string, string[], string | null, string, number] => [
    challengeId,
    purpose,
    options.proof.kind,
    proofHash,
    adminEmails,
    passwordHash,
    tokenHash,
    sessionMaxAgeSeconds,
  ]
  const completionSql = `select *
    from verdun_complete_email_challenge(
      $1::uuid,
      $2,
      $3,
      $4,
      $5,
      $6,
      $7,
      $8
    )`

  let newPasswordHash: string | null = null
  if (purpose === 'password_reset') {
    const preflightRows = await sql.query(
      completionSql,
      completionParams(null, hashVerdunSessionToken(randomBytes(32).toString('base64url'))),
    ) as CompletionRow[]
    if (!preflightRows[0]?.proof_valid) throw new Error('email_challenge_invalid')
    newPasswordHash = await hashVerdunPassword(assertVerdunPassword(options.newPassword ?? ''))
  }

  const rows = await sql.query(
    completionSql,
    completionParams(newPasswordHash, hashVerdunSessionToken(sessionToken)),
  ) as CompletionRow[]
  const row = rows[0]
  if (!row || !row.proof_valid || !row.account_row) throw new Error('email_challenge_invalid')
  return {
    account: verdunAccountFromRow(row.account_row),
    sessionToken,
  }
}

export async function authenticateVerdunEmailPassword(
  sql: VerdunAccountSql,
  options: VerdunEmailPasswordAuthentication,
): Promise<VerdunAuthenticationResult> {
  const email = normalizeVerdunEmail(options.email)
  const authPepper = assertVerdunAuthPepper(options.authPepper)
  const password = assertVerdunPassword(options.password)
  await enforceVerdunAuthRateLimit(sql, {
    scope: 'email_password:email',
    key: email,
    authPepper,
    limit: 5,
    windowSeconds: 15 * 60,
  })
  await enforceVerdunAuthRateLimit(sql, {
    scope: 'email_password:ip',
    key: options.ipAddress,
    authPepper,
    limit: 30,
    windowSeconds: 15 * 60,
  })

  const credentialRows = await sql.query(
    `select account.*, identity.password_hash
     from verdun_account account
     join verdun_account_identity identity
       on identity.account_id = account.id
      and identity.provider = 'email'
     where account.email = $1
     limit 1`,
    [email],
  ) as Array<VerdunAccountRow & { password_hash: string | null }>
  const credential = credentialRows[0]
  const dummyPasswordHash = await dummyVerdunPasswordHash()
  const passwordHash = credential?.password_hash ?? dummyPasswordHash
  const valid = await verifyVerdunPassword(password, passwordHash)
  if (!credential || !valid) throw new Error('invalid_email_or_password')
  if (credential.status !== 'active') throw new Error('suspended_account')

  const sessionMaxAgeSeconds = boundedInteger(
    options.sessionMaxAgeSeconds,
    verdunDefaultSessionMaxAgeSeconds,
    60,
    60 * 60 * 24 * 365,
    'invalid_session_lifetime',
  )
  const sessionToken = randomBytes(32).toString('base64url')
  const rows = await sql.query(
    `with inserted_session as (
       insert into verdun_account_session (token_hash, account_id, expires_at)
       select $1, id, now() + ($3::text || ' seconds')::interval
       from verdun_account
       where id = $2 and status = 'active'
       returning account_id
     ),
     used_identity as (
       update verdun_account_identity
       set last_used_at = now(), updated_at = now()
       where account_id = (select account_id from inserted_session)
         and provider = 'email'
       returning account_id
     ),
     updated_account as (
       update verdun_account
       set last_login_at = now(), updated_at = now()
       where id = (select account_id from used_identity)
       returning *
     )
     select * from updated_account`,
    [hashVerdunSessionToken(sessionToken), credential.id, sessionMaxAgeSeconds],
  ) as VerdunAccountRow[]
  if (!rows[0]) throw new Error('suspended_account')
  return {
    account: verdunAccountFromRow(rows[0]),
    sessionToken,
  }
}

export async function listVerdunAccountIdentities(
  sql: VerdunAccountSql,
  accountId: string,
): Promise<VerdunAccountIdentity[]> {
  const rows = await sql.query(
    `select
       provider,
       verified_email,
       verified_at,
       last_used_at,
       (password_hash is not null) as has_password
     from verdun_account_identity
     where account_id = $1
     order by created_at, provider`,
    [accountId],
  ) as Array<{
    provider: VerdunIdentityProvider
    verified_email: string
    verified_at: string
    last_used_at: string | null
    has_password: boolean
  }>
  return rows.map((row) => ({
    provider: row.provider,
    email: row.verified_email,
    verifiedAt: row.verified_at,
    lastUsedAt: row.last_used_at,
    hasPassword: row.has_password,
  }))
}

export async function deleteExpiredVerdunAuthArtifacts(
  sql: VerdunAccountSql,
): Promise<{ challenges: number, rateBuckets: number }> {
  const challengeRows = await sql.query(
    `delete from verdun_auth_challenge
     where expires_at < now() - interval '1 day'
        or consumed_at < now() - interval '1 day'
        or superseded_at < now() - interval '1 day'
     returning id`,
  ) as Array<{ id: string }>
  const bucketRows = await sql.query(
    `delete from verdun_auth_rate_bucket
     where expires_at <= now()
     returning scope`,
  ) as Array<{ scope: string }>
  return { challenges: challengeRows.length, rateBuckets: bucketRows.length }
}

async function markVerdunEmailChallengeDelivery(
  sql: VerdunAccountSql,
  challengeId: string,
  state: 'sent' | 'failed',
): Promise<void> {
  await sql.query(
    `update verdun_auth_challenge
     set
       delivery_state = $2,
       sent_at = case when $2 = 'sent' then now() else sent_at end
     where id = $1::uuid
       and delivery_state = 'pending'`,
    [challengeId, state],
  )
}

function assertChallengePurpose(value: string): VerdunEmailChallengePurpose {
  if (!verdunEmailChallengePurposes.includes(value as VerdunEmailChallengePurpose)) {
    throw new Error('invalid_email_challenge_purpose')
  }
  return value as VerdunEmailChallengePurpose
}

function assertEmailCode(value: string): string {
  const code = value.trim()
  if (!/^\d{6}$/.test(code)) throw new Error('email_challenge_invalid')
  return code
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function boundedInteger(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
  errorMessage: string,
): number {
  const normalized = value ?? fallback
  if (!Number.isInteger(normalized) || normalized < minimum || normalized > maximum) {
    throw new Error(errorMessage)
  }
  return normalized
}

function scryptKey(
  password: string,
  salt: Buffer,
  cost: number,
  blockSize: number,
  parallelization: number,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, scryptKeyLength, {
      N: cost,
      r: blockSize,
      p: parallelization,
      maxmem: scryptMaxMemory,
    }, (error, derivedKey) => {
      if (error) reject(error)
      else resolve(derivedKey)
    })
  })
}

function dummyVerdunPasswordHash(): Promise<string> {
  dummyPasswordHashPromise ??= hashVerdunPassword('verdun-dummy-password-never-used')
  return dummyPasswordHashPromise
}

function emailChallengeAction(purpose: VerdunEmailChallengePurpose): string {
  if (purpose === 'verify_email') return 'Verify your email address'
  if (purpose === 'password_reset') return 'Reset your password'
  return 'Log in with your email address'
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  })[character] ?? character)
}
