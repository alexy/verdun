import { neon } from '@neondatabase/serverless'
import { createHash, randomBytes } from 'node:crypto'
import {
  isVerdunAccountStatus,
  verdunCapabilitiesForTier,
  type VerdunAccount,
  type VerdunAccountStatus,
  type VerdunAccountTier,
  type VerdunTierCapabilities,
  type VerdunUsageWindow,
} from './account-types.js'
import { verdunCookieValue, verdunDefaultSessionMaxAgeSeconds } from './http.js'

export type VerdunAccountRequest = {
  headers?: Record<string, string | string[] | undefined>
}

export type VerdunAccountSql = ReturnType<typeof neon>

export type VerdunAccountContext = {
  account: VerdunAccount
  capabilities: VerdunTierCapabilities
}

export type VerdunUsageOptions = {
  capability?: string
  limit?: number | null
  limitReachedError?: string
}

export type GoogleAccountProfile = {
  sub: string
  email: string
  name: string | null
  pictureUrl: string | null
}

type AccountRow = {
  id: string
  email: string
  name: string | null
  picture_url: string | null
  provider: 'google'
  provider_subject: string
  tier: VerdunAccountTier
  status: 'active' | 'suspended'
  created_at: string
  updated_at: string
  last_login_at: string | null
}

export function verdunAccountDatabaseUrl(env: Record<string, string | undefined>): string | undefined {
  return env.POSTGRES_URL ?? env.DATABASE_URL ?? env.NEON_DATABASE_URL
}

export function verdunAccountSql(env: Record<string, string | undefined>): VerdunAccountSql {
  const databaseUrl = verdunAccountDatabaseUrl(env)
  if (!databaseUrl) throw new Error('database_not_configured')
  return neon(databaseUrl)
}

export function verdunAdminEmailsFromEnv(
  env: Record<string, string | undefined>,
  extraEnvKeys: string[] = [],
): string[] {
  return [...new Set(
    ['VERDUN_ADMIN_EMAILS', ...extraEnvKeys]
      .flatMap((key) => (env[key] ?? '').split(','))
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  )]
}

export async function upsertVerdunGoogleAccount(
  sql: VerdunAccountSql,
  profile: GoogleAccountProfile,
  adminEmails: Iterable<string>,
): Promise<VerdunAccount> {
  const admins = new Set(Array.from(adminEmails).map((email) => email.trim().toLowerCase()).filter(Boolean))
  const normalizedSubject = profile.sub.trim()
  const normalizedEmail = profile.email.trim().toLowerCase()
  if (!normalizedSubject || !normalizedEmail) throw new Error('google_credential_profile_incomplete')
  const identityRows = await sql.query(
    `select id
     from verdun_account
     where provider = 'google'
       and (provider_subject = $1 or email = $2)`,
    [normalizedSubject, normalizedEmail],
  ) as Array<{ id: string }>
  if (new Set(identityRows.map((row) => row.id)).size > 1) {
    throw new Error('google_account_identity_conflict')
  }

  const defaultTier: VerdunAccountTier = admins.has(normalizedEmail) ? 'admin' : 'free'
  const rows = await sql.query(
    `with matched_account as (
       select id
       from verdun_account
       where provider = 'google'
         and (provider_subject = $4 or email = $1)
       order by case when provider_subject = $4 then 0 else 1 end
       limit 1
     ),
     updated_account as (
       update verdun_account
       set
         email = $1,
         name = $2,
         picture_url = $3,
         provider_subject = $4,
         tier = case
           when $5 = 'admin' then 'admin'
           else verdun_account.tier
         end,
         updated_at = now()
       where id = (select id from matched_account)
       returning *
     ),
     inserted_account as (
       insert into verdun_account (email, name, picture_url, provider, provider_subject, tier)
       select $1, $2, $3, 'google', $4, $5
       where not exists (select 1 from updated_account)
       returning *
     )
     select * from updated_account
     union all
     select * from inserted_account`,
    [normalizedEmail, profile.name, profile.pictureUrl, normalizedSubject, defaultTier],
  ) as AccountRow[]
  return verdunAccountFromRow(rows[0])
}

export async function createVerdunAccountSession(
  sql: VerdunAccountSql,
  accountId: string,
  maxAgeSeconds = verdunDefaultSessionMaxAgeSeconds,
): Promise<string> {
  if (!Number.isFinite(maxAgeSeconds) || maxAgeSeconds <= 0) throw new Error('invalid_session_lifetime')
  const accountRows = await sql.query(
    `select status from verdun_account where id = $1 limit 1`,
    [accountId],
  ) as Array<{ status: AccountRow['status'] }>
  if (!accountRows[0]) throw new Error('account_not_found')
  if (accountRows[0].status !== 'active') throw new Error('suspended_account')

  const token = randomBytes(32).toString('base64url')
  await sql.query(
    `with inserted_session as (
       insert into verdun_account_session (token_hash, account_id, expires_at)
       values ($1, $2, now() + ($3::text || ' seconds')::interval)
       returning account_id
     )
     update verdun_account
     set last_login_at = now(), updated_at = now()
     where id = (select account_id from inserted_session)`,
    [hashVerdunSessionToken(token), accountId, maxAgeSeconds],
  )
  return token
}

export async function revokeVerdunAccountSession(
  sql: VerdunAccountSql,
  req: VerdunAccountRequest,
): Promise<boolean> {
  const token = verdunCookieValue(header(req, 'cookie'))
  if (!token) return false
  const rows = await sql.query(
    `delete from verdun_account_session
     where token_hash = $1
     returning account_id`,
    [hashVerdunSessionToken(token)],
  ) as Array<{ account_id: string }>
  return rows.length > 0
}

export async function deleteExpiredVerdunAccountSessions(sql: VerdunAccountSql): Promise<number> {
  const rows = await sql.query(
    `delete from verdun_account_session
     where expires_at <= now()
     returning token_hash`,
  ) as Array<{ token_hash: string }>
  return rows.length
}

export async function currentVerdunAccount(
  sql: VerdunAccountSql,
  req: VerdunAccountRequest,
): Promise<VerdunAccountContext> {
  const token = verdunCookieValue(header(req, 'cookie'))
  if (!token) throw new Error('account_required')
  const rows = await sql.query(
    `select a.*
     from verdun_account_session s
     join verdun_account a on a.id = s.account_id
     where s.token_hash = $1 and s.expires_at > now()
     limit 1`,
    [hashVerdunSessionToken(token)],
  ) as AccountRow[]
  const account = rows[0] ? verdunAccountFromRow(rows[0]) : null
  if (!account) {
    await deleteExpiredVerdunAccountSessionToken(sql, token)
    throw new Error('account_required')
  }
  if (account.status !== 'active') throw new Error('suspended_account')
  return {
    account,
    capabilities: verdunCapabilitiesForTier(account.tier),
  }
}

export async function verdunAccountUsage(
  sql: VerdunAccountSql,
  account: VerdunAccount,
  options: string | VerdunUsageOptions = {},
): Promise<VerdunUsageWindow> {
  const usageOptions = normalizeVerdunUsageOptions(options)
  const rows = await sql.query(
    `select coalesce(max(used), 0)::integer as used, current_date::text as window_start
     from verdun_account_usage
     where account_id = $1 and capability = $2 and window_start = current_date`,
    [account.id, usageOptions.capability],
  ) as Array<{ used: number, window_start: string }>
  const used = Number(rows[0]?.used ?? 0)
  return {
    accountId: account.id,
    capability: usageOptions.capability,
    windowStart: rows[0]?.window_start ?? new Date().toISOString().slice(0, 10),
    used,
    limit: usageOptions.limit,
    remaining: usageOptions.limit === null ? null : Math.max(0, usageOptions.limit - used),
    unlimited: usageOptions.limit === null,
  }
}

async function deleteExpiredVerdunAccountSessionToken(sql: VerdunAccountSql, token: string): Promise<void> {
  await sql.query(
    `delete from verdun_account_session
     where token_hash = $1
       and expires_at <= now()`,
    [hashVerdunSessionToken(token)],
  )
}

export async function recordVerdunAccountUsage(
  sql: VerdunAccountSql,
  account: VerdunAccount,
  options: string | VerdunUsageOptions = {},
  subjectId?: string | null,
): Promise<VerdunUsageWindow> {
  await requireActiveVerdunAccount(sql, account.id)
  const usageOptions = normalizeVerdunUsageOptions(options)
  if (usageOptions.limit === null) return verdunAccountUsage(sql, account, usageOptions)
  const normalizedSubjectId = subjectId?.trim() || null

  if (normalizedSubjectId) {
    await sql.query(
      `insert into verdun_account_usage (account_id, capability, window_start, used)
       values ($1, $2, current_date, 0)
       on conflict (account_id, capability, window_start) do nothing`,
      [account.id, usageOptions.capability],
    )
    const rows = await sql.query(
      `with usage_window as (
         select used
         from verdun_account_usage
         where account_id = $1
           and capability = $2
           and window_start = current_date
         limit 1
       ),
       existing_subject as (
         select subject_id
         from verdun_account_usage_subject
         where account_id = $1
           and capability = $2
           and window_start = current_date
           and subject_id = $3
       ),
       inserted_subject as (
         insert into verdun_account_usage_subject (account_id, capability, window_start, subject_id)
         select $1, $2, current_date, $3
         where not exists (select 1 from existing_subject)
           and (select used from usage_window) < $4
         on conflict (account_id, capability, window_start, subject_id) do nothing
         returning subject_id
       ),
       incremented_usage as (
         update verdun_account_usage
         set used = used + 1, updated_at = now()
         where (
           account_id = $1
           and capability = $2
           and window_start = current_date
           and used < $4
           and exists (select 1 from inserted_subject)
         )
         returning used
       ),
       cleanup_subject as (
         delete from verdun_account_usage_subject
         where account_id = $1
           and capability = $2
           and window_start = current_date
           and subject_id = $3
           and exists (select 1 from inserted_subject)
           and not exists (select 1 from incremented_usage)
         returning subject_id
       )
       select
         (select count(*)::integer from existing_subject) as existing_subject_count,
         (select count(*)::integer from inserted_subject) as inserted_subject_count,
         (select count(*)::integer from incremented_usage) as incremented_usage_count`,
      [account.id, usageOptions.capability, normalizedSubjectId, usageOptions.limit],
    ) as Array<{ existing_subject_count: number, inserted_subject_count: number, incremented_usage_count: number }>
    const existingSubjectCount = Number(rows[0]?.existing_subject_count ?? 0)
    const insertedSubjectCount = Number(rows[0]?.inserted_subject_count ?? 0)
    const incrementedUsageCount = Number(rows[0]?.incremented_usage_count ?? 0)
    if (existingSubjectCount > 0) return verdunAccountUsage(sql, account, usageOptions)
    if (insertedSubjectCount === 0) throw new Error(usageOptions.limitReachedError)
    if (incrementedUsageCount === 0) throw new Error(usageOptions.limitReachedError)
    return verdunAccountUsage(sql, account, usageOptions)
  }

  const rows = await sql.query(
    `insert into verdun_account_usage (account_id, capability, window_start, used)
     values ($1, $2, current_date, 1)
     on conflict (account_id, capability, window_start)
     do update set used = verdun_account_usage.used + 1, updated_at = now()
     where verdun_account_usage.used < $3
     returning used`,
    [account.id, usageOptions.capability, usageOptions.limit],
  ) as Array<{ used: number }>
  if (!rows[0]) throw new Error(usageOptions.limitReachedError)
  return verdunAccountUsage(sql, account, usageOptions)
}

function normalizeVerdunUsageOptions(options: string | VerdunUsageOptions): Required<VerdunUsageOptions> {
  if (typeof options === 'string') {
    return {
      capability: options.trim() || 'usage',
      limit: null,
      limitReachedError: 'usage_limit_reached',
    }
  }
  return {
    capability: options.capability?.trim() || 'usage',
    limit: typeof options.limit === 'number' && Number.isFinite(options.limit)
      ? Math.max(0, Math.floor(options.limit))
      : null,
    limitReachedError: options.limitReachedError?.trim() || 'usage_limit_reached',
  }
}

export async function updateVerdunAccountStatus(
  sql: VerdunAccountSql,
  accountId: string,
  status: unknown,
): Promise<VerdunAccount> {
  if (!isVerdunAccountStatus(status)) throw new Error('invalid_status')
  const accountRows = await sql.query(
    `select status from verdun_account where id = $1 limit 1`,
    [accountId],
  ) as Array<{ status: VerdunAccountStatus }>
  if (!accountRows[0]) throw new Error('account_not_found')
  if (accountRows[0].status === status) throw new Error('account_status_unchanged')
  const rows = await sql.query(
    `with updated_account as (
       update verdun_account
       set status = $2, updated_at = now()
       where id = $1
       returning *
     ),
     revoked_sessions as (
       delete from verdun_account_session
       where account_id = $1 and $2 = 'suspended'
       returning account_id
     )
     select updated_account.*
     from updated_account`,
    [accountId, status],
  ) as AccountRow[]
  if (!rows[0]) throw new Error('account_not_found')
  return verdunAccountFromRow(rows[0])
}

async function requireActiveVerdunAccount(sql: VerdunAccountSql, accountId: string): Promise<void> {
  const accountRows = await sql.query(
    `select status from verdun_account where id = $1 limit 1`,
    [accountId],
  ) as Array<{ status: AccountRow['status'] }>
  if (!accountRows[0]) throw new Error('account_not_found')
  if (accountRows[0].status !== 'active') throw new Error('suspended_account')
}

export function hashVerdunSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function verdunAccountFromRow(row: AccountRow): VerdunAccount {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    pictureUrl: row.picture_url,
    provider: row.provider,
    providerSubject: row.provider_subject,
    tier: row.tier,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastLoginAt: row.last_login_at,
  }
}

function header(req: VerdunAccountRequest, name: string): string | undefined {
  const value = req.headers?.[name] ?? req.headers?.[name.toLowerCase()]
  return Array.isArray(value) ? value.join(', ') : value
}
