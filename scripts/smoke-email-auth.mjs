#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const artifactRoot = new URL('../.codex-artifacts/', import.meta.url)
await mkdir(artifactRoot, { recursive: true })
const outDir = await mkdtemp(new URL('email-auth-smoke-', artifactRoot))
const compile = spawnSync('node_modules/.bin/tsc', [
  '--ignoreConfig',
  '--outDir',
  outDir,
  '--module',
  'NodeNext',
  '--moduleResolution',
  'NodeNext',
  '--target',
  'ES2022',
  '--types',
  'node',
  '--skipLibCheck',
  'src/accounts/account-types.ts',
  'src/accounts/http.ts',
  'src/accounts/store.ts',
  'src/accounts/email-auth.ts',
], {
  cwd: new URL('..', import.meta.url),
  stdio: 'inherit',
})
if (compile.error) throw compile.error
if (compile.status !== 0) throw new Error(`Verdun email auth smoke TypeScript compile exited with ${compile.status}`)

const emailAuth = await import(pathToFileURL(join(outDir, 'src/accounts/email-auth.js')).href)
const {
  assertVerdunAuthPepper,
  authenticateVerdunEmailPassword,
  buildVerdunEmailChallengeLink,
  completeVerdunEmailChallenge,
  deleteExpiredVerdunAuthArtifacts,
  deliverVerdunEmailChallenge,
  enforceVerdunAuthRateLimit,
  hashVerdunEmailCode,
  hashVerdunEmailLinkToken,
  hashVerdunPassword,
  listVerdunAccountIdentities,
  normalizeVerdunEmail,
  requestVerdunEmailChallenge,
  verifyVerdunPassword,
  verdunDefaultEmailChallengeLifetimeSeconds,
  verdunDefaultEmailChallengeMaxAttempts,
} = emailAuth

const pepper = 'verdun-email-auth-smoke-pepper-32-bytes-minimum'
const accountRow = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'person@example.test',
  name: null,
  picture_url: null,
  provider: 'email',
  provider_subject: 'person@example.test',
  tier: 'free',
  status: 'active',
  created_at: '2026-07-14T00:00:00.000Z',
  updated_at: '2026-07-14T00:00:00.000Z',
  last_login_at: '2026-07-14T00:00:00.000Z',
}

if (normalizeVerdunEmail(' Person@Example.Test ') !== 'person@example.test') {
  throw new Error('email normalization must trim and lowercase without provider-specific rewriting')
}
for (const invalidEmail of ['', 'missing-at.example.test', 'person@localhost', 'two words@example.test', 'two@ats@example.test']) {
  await expectError(() => normalizeVerdunEmail(invalidEmail), 'invalid_email')
}
if (assertVerdunAuthPepper(` ${pepper} `) !== pepper) throw new Error('auth pepper should be trimmed')
await expectError(() => assertVerdunAuthPepper('too-short'), 'auth_pepper_not_configured')

const password = 'correct horse battery staple'
const passwordHash = await hashVerdunPassword(password)
if (!passwordHash.startsWith('scrypt$32768$8$1$') || passwordHash.includes(password)) {
  throw new Error(`password hash uses an unexpected or unsafe representation: ${passwordHash}`)
}
if (!await verifyVerdunPassword(password, passwordHash)) throw new Error('password verifier rejected the correct password')
if (await verifyVerdunPassword('wrong-password', passwordHash)) throw new Error('password verifier accepted an incorrect password')
if (await verifyVerdunPassword(password, 'not-a-password-hash')) throw new Error('password verifier accepted an invalid hash')

const linkToken = 'raw-link-token'
const tokenHash = hashVerdunEmailLinkToken(linkToken)
if (tokenHash === linkToken || tokenHash.length !== 64) throw new Error('link tokens must be stored as SHA-256 hashes')
const codeHash = hashVerdunEmailCode(accountRow.id, '001234', pepper)
if (codeHash.includes('001234') || codeHash === hashVerdunEmailCode(accountRow.id, '001234', `${pepper}-different`)) {
  throw new Error('six-digit codes must be stored as challenge-bound, peppered HMACs')
}

const sql = fakeSql({ accountRow, passwordHash })
const challenge = await requestVerdunEmailChallenge(sql, {
  purpose: 'verify_email',
  email: ' Person@Example.Test ',
  password,
  authPepper: pepper,
  ipAddress: '192.0.2.10',
})
if (!challenge) throw new Error('email verification challenge was unexpectedly suppressed')
if (!/^\d{6}$/.test(challenge.code) || challenge.token.length < 40) {
  throw new Error(`email challenge secrets have an unexpected shape: ${JSON.stringify(challenge)}`)
}
if (verdunDefaultEmailChallengeLifetimeSeconds !== 600 || verdunDefaultEmailChallengeMaxAttempts !== 5) {
  throw new Error('email challenge lifetime and attempt defaults drifted from the security contract')
}
const issueParams = sql.lastIssueParams()
if (issueParams.includes(challenge.token) || issueParams.includes(challenge.code)) {
  throw new Error('raw challenge token or code was sent to database storage')
}

const challengeLink = buildVerdunEmailChallengeLink(challenge, {
  appName: 'Example App',
  appUrl: 'https://app.example.test',
  completionPath: '/sign-in',
})
const parsedChallengeLink = new URL(challengeLink)
if (parsedChallengeLink.search || !parsedChallengeLink.hash.includes(challenge.token)) {
  throw new Error(`magic-link secrets must stay in the URL fragment: ${challengeLink}`)
}
let sentMessage
await deliverVerdunEmailChallenge(sql, async (message) => {
  sentMessage = message
}, challenge, {
  appName: 'Example App',
  appUrl: 'https://app.example.test',
  completionPath: '/sign-in',
})
if (!sentMessage?.text.includes(challenge.code) || !sentMessage?.text.includes(challengeLink)) {
  throw new Error('verification email must contain both the six-digit code and one-time link')
}
if (sql.deliveryState() !== 'sent') throw new Error('successful challenge delivery was not recorded')

let loginMessage
await deliverVerdunEmailChallenge(sql, async (message) => {
  loginMessage = message
}, { ...challenge, purpose: 'passwordless_login' }, {
  appName: 'Example App',
  appUrl: 'https://app.example.test',
  completionPath: '/sign-in',
})
if (!loginMessage?.text.includes('Log in with your email address') || loginMessage.text.includes('Sign in with your email address')) {
  throw new Error('passwordless email action must use canonical Log in terminology')
}

const completed = await completeVerdunEmailChallenge(sql, {
  challengeId: challenge.id,
  purpose: 'verify_email',
  proof: { kind: 'code', code: challenge.code },
  authPepper: pepper,
  ipAddress: '192.0.2.10',
  adminEmails: ['admin@example.test'],
})
if (completed.account.id !== accountRow.id || completed.sessionToken.length < 40) {
  throw new Error(`challenge completion returned an invalid account/session: ${JSON.stringify(completed)}`)
}
const completionParams = sql.lastCompletionParams()
if (completionParams.includes(challenge.code) || completionParams.includes(completed.sessionToken)) {
  throw new Error('raw challenge code or session token was sent to database storage')
}

const passwordAuthentication = await authenticateVerdunEmailPassword(sql, {
  email: accountRow.email,
  password,
  authPepper: pepper,
  ipAddress: '192.0.2.10',
})
if (passwordAuthentication.account.id !== accountRow.id || !passwordAuthentication.sessionToken) {
  throw new Error('email/password authentication did not return the linked account and a session token')
}
await expectError(() => authenticateVerdunEmailPassword(sql, {
  email: accountRow.email,
  password: 'definitely-wrong',
  authPepper: pepper,
  ipAddress: '192.0.2.10',
}), 'invalid_email_or_password')

const identities = await listVerdunAccountIdentities(sql, accountRow.id)
if (identities.length !== 2 || identities[0].provider !== 'google' || identities[1].provider !== 'email' || !identities[1].hasPassword) {
  throw new Error(`linked identity list did not preserve provider methods: ${JSON.stringify(identities)}`)
}

const cleanup = await deleteExpiredVerdunAuthArtifacts(sql)
if (cleanup.challenges !== 1 || cleanup.rateBuckets !== 1) {
  throw new Error(`auth artifact cleanup returned unexpected counts: ${JSON.stringify(cleanup)}`)
}

sql.setRateLimited(true)
await expectError(() => enforceVerdunAuthRateLimit(sql, {
  scope: 'smoke',
  key: 'person@example.test',
  authPepper: pepper,
  limit: 1,
  windowSeconds: 60,
}), 'auth_rate_limited')

console.log('Verdun email auth smoke passed')

async function expectError(action, message) {
  try {
    await action()
  } catch (error) {
    if (error instanceof Error && error.message === message) return
    throw error
  }
  throw new Error(`expected error ${message}`)
}

function fakeSql({ accountRow: row, passwordHash: storedPasswordHash }) {
  let issueParams = []
  let completionParams = []
  let deliveryState = 'pending'
  let rateLimited = false
  return {
    lastIssueParams: () => issueParams,
    lastCompletionParams: () => completionParams,
    deliveryState: () => deliveryState,
    setRateLimited: (value) => { rateLimited = value },
    async query(sqlText, params = []) {
      const normalized = sqlText.replace(/\s+/g, ' ').trim()
      if (normalized.startsWith('insert into verdun_auth_rate_bucket')) {
        return rateLimited ? [] : [{ attempts: 1 }]
      }
      if (normalized.startsWith('select * from verdun_issue_email_challenge(')) {
        issueParams = [...params]
        return [{
          id: params[0],
          purpose: params[1],
          email: params[2],
          created_at: '2026-07-14T00:00:00.000Z',
          expires_at: '2026-07-14T00:10:00.000Z',
        }]
      }
      if (normalized.startsWith('update verdun_auth_challenge set delivery_state')) {
        deliveryState = params[1]
        return []
      }
      if (normalized.startsWith('select * from verdun_complete_email_challenge(')) {
        completionParams = [...params]
        return [{ proof_valid: true, challenge_attempts: 0, account_row: row }]
      }
      if (normalized.startsWith('select account.*, identity.password_hash')) {
        return [{ ...row, password_hash: storedPasswordHash }]
      }
      if (normalized.startsWith('with inserted_session as')) return [row]
      if (normalized.startsWith('select provider, verified_email')) {
        return [
          {
            provider: 'google',
            verified_email: row.email,
            verified_at: row.created_at,
            last_used_at: row.last_login_at,
            has_password: false,
          },
          {
            provider: 'email',
            verified_email: row.email,
            verified_at: row.created_at,
            last_used_at: row.last_login_at,
            has_password: true,
          },
        ]
      }
      if (normalized.startsWith('delete from verdun_auth_challenge')) return [{ id: 'expired-challenge' }]
      if (normalized.startsWith('delete from verdun_auth_rate_bucket')) return [{ scope: 'expired-bucket' }]
      throw new Error(`unexpected email-auth smoke SQL: ${normalized}`)
    },
  }
}
