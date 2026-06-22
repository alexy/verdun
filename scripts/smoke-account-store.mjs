#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const artifactRoot = new URL('../.codex-artifacts/', import.meta.url)
await mkdir(artifactRoot, { recursive: true })
const outDir = await mkdtemp(new URL('account-store-smoke-', artifactRoot))
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
], {
  cwd: new URL('..', import.meta.url),
  stdio: 'inherit',
})
if (compile.error) throw compile.error
if (compile.status !== 0) throw new Error(`Verdun account store smoke TypeScript compile exited with ${compile.status}`)

const {
  createVerdunAccountSession,
  currentVerdunAccount,
  deleteExpiredVerdunAccountSessions,
  hashVerdunSessionToken,
  recordVerdunAccountUsage,
  revokeVerdunAccountSession,
  updateVerdunAccountStatus,
  upsertVerdunGoogleAccount,
  verdunAdminEmailsFromEnv,
  verdunAccountUsage,
} = await import(pathToFileURL(join(outDir, 'store.js')).href)
const {
  clearVerdunSessionCookie,
  verdunAccountCookieName,
  verdunCookieValue,
  verdunDefaultSessionMaxAgeSeconds,
  verdunSessionCookie,
} = await import(pathToFileURL(join(outDir, 'http.js')).href)
const {
  isVerdunAccountStatus,
  isVerdunAccountTier,
  verdunAccountStatuses,
  verdunAccountTiers,
  verdunPublicAccount,
} = await import(pathToFileURL(join(outDir, 'account-types.js')).href)

const sql = fakeSql()
const accountStoreSource = await readFile(new URL('../src/accounts/store.ts', import.meta.url), 'utf8')
if (!accountStoreSource.includes('and exists (select 1 from inserted_subject)\n         )\n         returning used')) {
  throw new Error('distinct-subject usage SQL must close the update predicate before returning used')
}

if (verdunAccountCookieName !== 'verdun_account') {
  throw new Error(`unexpected Verdun account cookie name ${verdunAccountCookieName}`)
}
if (verdunDefaultSessionMaxAgeSeconds !== 60 * 60 * 24 * 30) {
  throw new Error(`unexpected Verdun default session lifetime ${verdunDefaultSessionMaxAgeSeconds}`)
}
if (verdunAccountTiers.join(',') !== 'free,buyer,pro,admin') {
  throw new Error(`Verdun account tiers should be exposed as the generic typed source of truth: ${verdunAccountTiers.join(',')}`)
}
if (verdunAccountStatuses.join(',') !== 'active,suspended') {
  throw new Error(`Verdun account statuses should be exposed as the generic typed source of truth: ${verdunAccountStatuses.join(',')}`)
}
for (const tier of verdunAccountTiers) {
  if (!isVerdunAccountTier(tier)) throw new Error(`Verdun account tier guard rejected ${tier}`)
}
for (const status of verdunAccountStatuses) {
  if (!isVerdunAccountStatus(status)) throw new Error(`Verdun account status guard rejected ${status}`)
}
if (isVerdunAccountTier('paid') || isVerdunAccountStatus('paused')) {
  throw new Error('Verdun account guards accepted app-specific or invalid account state values')
}
const sessionCookie = verdunSessionCookie('token with spaces/and=symbols', { secure: true })
if (!sessionCookie.startsWith('verdun_account=token%20with%20spaces%2Fand%3Dsymbols; Path=/;')) {
  throw new Error(`session cookie did not encode the token and path correctly: ${sessionCookie}`)
}
for (const requiredCookieAttribute of ['HttpOnly', 'SameSite=Lax', 'Secure', `Max-Age=${verdunDefaultSessionMaxAgeSeconds}`]) {
  if (!sessionCookie.includes(requiredCookieAttribute)) {
    throw new Error(`session cookie is missing ${requiredCookieAttribute}: ${sessionCookie}`)
  }
}
const localSessionCookie = verdunSessionCookie('local-token', { secure: false, maxAgeSeconds: 120 })
if (localSessionCookie.includes('Secure') || !localSessionCookie.includes('Max-Age=120')) {
  throw new Error(`local session cookie secure/max-age options were not honored: ${localSessionCookie}`)
}
const clearCookie = clearVerdunSessionCookie({ secure: true })
for (const requiredClearAttribute of ['verdun_account=', 'Path=/', 'Max-Age=0', 'HttpOnly', 'SameSite=Lax', 'Secure']) {
  if (!clearCookie.includes(requiredClearAttribute)) {
    throw new Error(`clear session cookie is missing ${requiredClearAttribute}: ${clearCookie}`)
  }
}
if (verdunCookieValue('other=1; verdun_account=abc%2F123%3D; theme=dark') !== 'abc/123=') {
  throw new Error('cookie parser did not extract and decode the Verdun account token')
}
if (verdunCookieValue('other=1; verdun_account=%E0%A4%A; theme=dark') !== '') {
  throw new Error('cookie parser should reject malformed Verdun account cookie encoding')
}
const adminEnvEmails = verdunAdminEmailsFromEnv({
  VERDUN_ADMIN_EMAILS: ' Admin@Example.Test,duplicate@example.test ',
  GREATHOUSE_ADMIN_EMAILS: 'duplicate@example.test, app-admin@example.test',
}, ['GREATHOUSE_ADMIN_EMAILS'])
if (adminEnvEmails.join(',') !== 'admin@example.test,duplicate@example.test,app-admin@example.test') {
  throw new Error(`admin env parsing should merge, normalize, and dedupe generic plus app-specific admin email keys: ${JSON.stringify(adminEnvEmails)}`)
}

const free = await upsertVerdunGoogleAccount(sql, {
  sub: 'google-free',
  email: 'Free@Example.Test',
  name: 'Free User',
  pictureUrl: null,
}, [])
if (free.tier !== 'free') throw new Error(`expected new non-admin account to be free, got ${free.tier}`)
if (free.email !== 'free@example.test') throw new Error(`expected Google account email to be lowercased, got ${free.email}`)
if (free.lastLoginAt !== null) throw new Error(`Google account upsert should not stamp a successful login before a session is minted: ${free.lastLoginAt}`)
const freePublicAccount = verdunPublicAccount(free)
if (freePublicAccount.providerSubject !== undefined || 'providerSubject' in freePublicAccount) {
  throw new Error(`Verdun public account DTO must not expose the internal Google provider subject: ${JSON.stringify(freePublicAccount)}`)
}
if (freePublicAccount.email !== free.email || freePublicAccount.provider !== 'google' || freePublicAccount.tier !== 'free') {
  throw new Error(`Verdun public account DTO did not preserve public account identity and state: ${JSON.stringify(freePublicAccount)}`)
}

const normalizedProfile = await upsertVerdunGoogleAccount(sql, {
  sub: ' google-normalized ',
  email: ' Normalized@Example.Test ',
  name: 'Normalized User',
  pictureUrl: null,
}, [])
if (normalizedProfile.email !== 'normalized@example.test' || normalizedProfile.providerSubject !== 'google-normalized') {
  throw new Error(`expected Verdun Google upsert to trim profile identity fields: ${JSON.stringify(normalizedProfile)}`)
}
await expectError(() => upsertVerdunGoogleAccount(sql, {
  sub: '   ',
  email: 'blank-sub@example.test',
  name: 'Blank Subject',
  pictureUrl: null,
}, []), 'google_credential_profile_incomplete')
await expectError(() => upsertVerdunGoogleAccount(sql, {
  sub: 'google-blank-email',
  email: '   ',
  name: 'Blank Email',
  pictureUrl: null,
}, []), 'google_credential_profile_incomplete')

const freeWithRotatedSubject = await upsertVerdunGoogleAccount(sql, {
  sub: 'google-free-rotated',
  email: 'Free@Example.Test',
  name: 'Free User New Subject',
  pictureUrl: null,
}, [])
if (freeWithRotatedSubject.id !== free.id) {
  throw new Error(`same verified Google email should preserve the Verdun account id: ${freeWithRotatedSubject.id} !== ${free.id}`)
}
if (freeWithRotatedSubject.providerSubject !== 'google-free-rotated') {
  throw new Error(`same-email Google login should update the provider subject, got ${freeWithRotatedSubject.providerSubject}`)
}

const admin = await upsertVerdunGoogleAccount(sql, {
  sub: 'google-admin',
  email: 'Admin@Example.Test',
  name: 'Admin User',
  pictureUrl: null,
}, ['admin@example.test'])
if (admin.tier !== 'admin') throw new Error(`expected admin bootstrap account to be admin, got ${admin.tier}`)
if (admin.email !== 'admin@example.test') throw new Error(`expected admin Google account email to be lowercased, got ${admin.email}`)
await expectError(() => upsertVerdunGoogleAccount(sql, {
  sub: 'google-admin',
  email: 'free@example.test',
  name: 'Conflicting Google Identity',
  pictureUrl: null,
}, []), 'google_account_identity_conflict')

const bootstrapLater = await upsertVerdunGoogleAccount(sql, {
  sub: 'google-bootstrap-later',
  email: 'bootstrap-later@example.test',
  name: 'Bootstrap Later',
  pictureUrl: null,
}, [])
if (bootstrapLater.tier !== 'free') {
  throw new Error(`expected account before admin bootstrap to be free, got ${bootstrapLater.tier}`)
}
const promotedBootstrap = await upsertVerdunGoogleAccount(sql, {
  sub: 'google-bootstrap-later',
  email: 'bootstrap-later@example.test',
  name: 'Bootstrap Later',
  pictureUrl: null,
}, ['bootstrap-later@example.test'])
if (promotedBootstrap.tier !== 'admin') {
  throw new Error(`expected existing bootstrap account to promote to admin, got ${promotedBootstrap.tier}`)
}
const retainedBootstrapAdmin = await upsertVerdunGoogleAccount(sql, {
  sub: 'google-bootstrap-later',
  email: 'bootstrap-later@example.test',
  name: 'Bootstrap Later',
  pictureUrl: null,
}, [])
if (retainedBootstrapAdmin.tier !== 'admin') {
  throw new Error(`expected existing admin account not to be demoted by bootstrap removal, got ${retainedBootstrapAdmin.tier}`)
}

const suspendedLogin = await upsertVerdunGoogleAccount(sql, {
  sub: 'google-suspended-login',
  email: 'suspended-login@example.test',
  name: 'Suspended Login',
  pictureUrl: null,
}, [])
await updateVerdunAccountStatus(sql, suspendedLogin.id, 'suspended')
const suspendedBeforeLoginAttempt = sql.accountSnapshot(suspendedLogin.id)
const suspendedLoginAttempt = await upsertVerdunGoogleAccount(sql, {
  sub: 'google-suspended-login',
  email: 'suspended-login@example.test',
  name: 'Suspended Login Attempt',
  pictureUrl: 'https://example.test/suspended.png',
}, [])
if (suspendedLoginAttempt.status !== 'suspended') {
  throw new Error(`expected suspended Google account to stay suspended after login attempt, got ${suspendedLoginAttempt.status}`)
}
if (suspendedLoginAttempt.lastLoginAt !== suspendedBeforeLoginAttempt.last_login_at) {
  throw new Error('suspended Google login attempts must not update Verdun lastLoginAt before a session is minted')
}
if (suspendedLoginAttempt.name !== 'Suspended Login Attempt' || suspendedLoginAttempt.pictureUrl !== 'https://example.test/suspended.png') {
  throw new Error(`suspended Google login attempt should still refresh non-login profile fields: ${JSON.stringify(suspendedLoginAttempt)}`)
}

const token = await createVerdunAccountSession(sql, free.id, 3600)
const context = await currentVerdunAccount(sql, { headers: { cookie: `verdun_account=${encodeURIComponent(token)}` } })
if (context.account.email !== free.email || context.capabilities.isAdmin !== false) {
  throw new Error('current account lookup did not return the free account and capabilities')
}
if (!context.account.lastLoginAt) {
  throw new Error('creating a Verdun account session should stamp the successful-login timestamp')
}
const revoked = await revokeVerdunAccountSession(sql, { headers: { cookie: `verdun_account=${encodeURIComponent(token)}` } })
if (!revoked) throw new Error('session revocation did not delete the stored Verdun session')
await expectError(() => currentVerdunAccount(sql, { headers: { cookie: `verdun_account=${encodeURIComponent(token)}` } }), 'account_required')

await expectError(() => createVerdunAccountSession(sql, free.id, 0), 'invalid_session_lifetime')
await expectError(() => createVerdunAccountSession(sql, free.id, -1), 'invalid_session_lifetime')

const expiredToken = await createVerdunAccountSession(sql, free.id, 3600)
sql.expireSessionToken(expiredToken)
await expectError(() => currentVerdunAccount(sql, { headers: { cookie: `verdun_account=${encodeURIComponent(expiredToken)}` } }), 'account_required')
if (sql.hasSessionToken(expiredToken)) throw new Error('current account lookup should opportunistically delete the presented expired session token')
await expectError(() => currentVerdunAccount(sql, { headers: { cookie: 'verdun_account=%E0%A4%A' } }), 'account_required')
const unpresentedExpiredToken = await createVerdunAccountSession(sql, free.id, 3600)
sql.expireSessionToken(unpresentedExpiredToken)
const liveCleanupToken = await createVerdunAccountSession(sql, free.id, 3600)
const deletedExpiredSessions = await deleteExpiredVerdunAccountSessions(sql)
if (deletedExpiredSessions !== 1) throw new Error(`expected one expired session to be deleted, got ${deletedExpiredSessions}`)
if (sql.hasSessionToken(unpresentedExpiredToken)) throw new Error('expired session cleanup did not delete the unpresented expired session')
const liveAfterCleanup = await currentVerdunAccount(sql, { headers: { cookie: `verdun_account=${encodeURIComponent(liveCleanupToken)}` } })
if (liveAfterCleanup.account.id !== free.id) throw new Error('expired session cleanup deleted a live session')
const statusMutationToken = await createVerdunAccountSession(sql, free.id, 3600)
await expectError(() => updateVerdunAccountStatus(sql, free.id, 'active'), 'account_status_unchanged')
await expectError(() => updateVerdunAccountStatus(sql, free.id, 'paused'), 'invalid_status')
const statusSuspended = await updateVerdunAccountStatus(sql, free.id, 'suspended')
if (statusSuspended.status !== 'suspended') throw new Error(`Verdun account status update did not suspend the account: ${JSON.stringify(statusSuspended)}`)
if (sql.hasSessionToken(statusMutationToken)) throw new Error('Verdun account status suspension should revoke active sessions for that account')
await expectError(() => createVerdunAccountSession(sql, free.id, 3600), 'suspended_account')
const statusReactivated = await updateVerdunAccountStatus(sql, free.id, 'active')
if (statusReactivated.status !== 'active') throw new Error(`Verdun account status update did not reactivate the account: ${JSON.stringify(statusReactivated)}`)
await expectError(() => updateVerdunAccountStatus(sql, 'missing-account', 'suspended'), 'account_not_found')

const suspended = await upsertVerdunGoogleAccount(sql, {
  sub: 'google-suspended',
  email: 'suspended@example.test',
  name: 'Suspended User',
  pictureUrl: null,
}, [])
sql.setAccountStatus(suspended.id, 'suspended')
await expectError(() => createVerdunAccountSession(sql, 'missing-account', 3600), 'account_not_found')
await expectError(() => createVerdunAccountSession(sql, suspended.id, 3600), 'suspended_account')
sql.setAccountStatus(suspended.id, 'active')
const suspendedToken = await createVerdunAccountSession(sql, suspended.id, 3600)
sql.setAccountStatus(suspended.id, 'suspended')
await expectError(() => currentVerdunAccount(sql, { headers: { cookie: `verdun_account=${encodeURIComponent(suspendedToken)}` } }), 'suspended_account')
await expectError(() => recordVerdunAccountUsage(sql, suspended), 'suspended_account')

const meteredUsage = {
  capability: 'demo_metered_action',
  limit: 3,
  limitReachedError: 'demo_meter_limit_reached',
}
const firstSubjectUsage = await recordVerdunAccountUsage(sql, free, meteredUsage, 'subject-a')
if (firstSubjectUsage.used !== 1 || firstSubjectUsage.remaining !== 2 || firstSubjectUsage.unlimited) {
  throw new Error(`metered usage counter mismatch after first distinct subject: ${JSON.stringify(firstSubjectUsage)}`)
}
if (firstSubjectUsage.windowStart !== '2099-12-31') {
  throw new Error(`Verdun usage should report the Postgres current_date usage window, not the Node process date: ${JSON.stringify(firstSubjectUsage)}`)
}
const repeatedSubjectUsage = await recordVerdunAccountUsage(sql, free, meteredUsage, 'subject-a')
if (repeatedSubjectUsage.used !== 1 || repeatedSubjectUsage.remaining !== 2 || repeatedSubjectUsage.unlimited) {
  throw new Error(`repeated use of the same subject should not consume another usage slot: ${JSON.stringify(repeatedSubjectUsage)}`)
}
sql.simulateSubjectIncrementMissOnce('subject-race')
await expectError(() => recordVerdunAccountUsage(sql, free, meteredUsage, 'subject-race'), 'demo_meter_limit_reached')
const retriedSubjectUsage = await recordVerdunAccountUsage(sql, free, meteredUsage, 'subject-race')
if (retriedSubjectUsage.used !== 2 || retriedSubjectUsage.remaining !== 1 || retriedSubjectUsage.unlimited) {
  throw new Error(`subject cleanup after a failed increment should allow a retry to consume quota: ${JSON.stringify(retriedSubjectUsage)}`)
}

const thirdSubjectUsage = await recordVerdunAccountUsage(sql, free, meteredUsage, 'subject-3')
if (thirdSubjectUsage.used !== 3 || thirdSubjectUsage.remaining !== 0 || thirdSubjectUsage.unlimited) {
  throw new Error(`metered usage counter mismatch after third distinct subject: ${JSON.stringify(thirdSubjectUsage)}`)
}

await expectError(() => recordVerdunAccountUsage(sql, free, meteredUsage, 'subject-4'), 'demo_meter_limit_reached')

const genericCapabilityUsage = await recordVerdunAccountUsage(sql, free, 'demo_unmetered_action')
if (!genericCapabilityUsage.unlimited || genericCapabilityUsage.limit !== null || genericCapabilityUsage.used !== 0 || genericCapabilityUsage.remaining !== null) {
  throw new Error(`usage without an explicit limit should remain unmetered in the Verdun account store: ${JSON.stringify(genericCapabilityUsage)}`)
}

const adminUsage = await recordVerdunAccountUsage(sql, admin)
if (!adminUsage.unlimited || adminUsage.limit !== null) {
  throw new Error(`admin usage should be unlimited: ${JSON.stringify(adminUsage)}`)
}

await expectError(() => currentVerdunAccount(sql, { headers: {} }), 'account_required')

console.log('Verdun account store smoke passed')

async function expectError(action, message) {
  try {
    await action()
  } catch (error) {
    if (error instanceof Error && error.message === message) return
    throw error
  }
  throw new Error(`expected error ${message}`)
}

function fakeSql() {
  const dbCurrentDate = '2099-12-31'
  const accounts = new Map()
  const accountByProvider = new Map()
  const sessions = new Map()
  const usage = new Map()
  const usageSubjects = new Set()
  const subjectIncrementMisses = new Set()
  let nextAccount = 1

  return {
    simulateSubjectIncrementMissOnce(subjectId) {
      subjectIncrementMisses.add(subjectId)
    },
    setAccountStatus(accountId, status) {
      const row = accounts.get(accountId)
      if (!row) throw new Error(`missing account ${accountId}`)
      row.status = status
    },
    accountSnapshot(accountId) {
      const row = accounts.get(accountId)
      if (!row) throw new Error(`missing account ${accountId}`)
      return { ...row }
    },
    hasSessionToken(token) {
      return sessions.has(hashVerdunSessionToken(token))
    },
    expireSessionToken(token) {
      const session = sessions.get(hashVerdunSessionToken(token))
      if (!session) throw new Error(`missing session for token ${token}`)
      session.expiresAt = Date.now() - 1000
    },
    async query(sqlText, params) {
      const normalized = sqlText.replace(/\s+/g, ' ').trim()
      if (normalized.startsWith('with matched_account as')) {
        const [email, name, pictureUrl, sub, tier] = params
        const providerKey = `google:${sub}`
        const existingByProviderId = accountByProvider.get(providerKey)
        const existingByEmail = Array.from(accounts.values()).find((account) => account.email === email)
        const existingId = existingByProviderId ?? existingByEmail?.id
        const now = new Date().toISOString()
        const row = existingId ? accounts.get(existingId) : {
          id: `account-${nextAccount++}`,
          provider: 'google',
          tier,
          status: 'active',
          created_at: now,
          last_login_at: null,
        }
        if (existingId && tier === 'admin') row.tier = 'admin'
        if (row.provider_subject) accountByProvider.delete(`google:${row.provider_subject}`)
        Object.assign(row, {
          email,
          name,
          picture_url: pictureUrl,
          provider_subject: sub,
          updated_at: now,
        })
        accounts.set(row.id, row)
        accountByProvider.set(providerKey, row.id)
        return [row]
      }

      if (normalized.startsWith('select id from verdun_account where provider =')) {
        const [sub, email] = params
        return Array.from(accounts.values())
          .filter((account) => account.provider === 'google' && (account.provider_subject === sub || account.email === email))
          .map((account) => ({ id: account.id }))
      }

      if (normalized.startsWith('with inserted_session as ( insert into verdun_account_session ')) {
        const [tokenHash, accountId, maxAgeSeconds] = params
        sessions.set(tokenHash, {
          accountId,
          expiresAt: Date.now() + Number(maxAgeSeconds) * 1000,
        })
        const account = accounts.get(accountId)
        if (account) {
          account.last_login_at = new Date().toISOString()
          account.updated_at = new Date().toISOString()
        }
        return []
      }

      if (normalized.startsWith('select status from verdun_account where id = $1')) {
        const [accountId] = params
        const account = accounts.get(accountId)
        return account ? [{ status: account.status }] : []
      }

      if (normalized.startsWith('with updated_account as ( update verdun_account')) {
        const [accountId, status] = params
        const account = accounts.get(accountId)
        if (!account) return []
        account.status = status
        account.updated_at = new Date().toISOString()
        if (status === 'suspended') {
          for (const [tokenHash, session] of sessions.entries()) {
            if (session.accountId === accountId) sessions.delete(tokenHash)
          }
        }
        return [account]
      }

      if (normalized.startsWith('select a.* from verdun_account_session')) {
        const [tokenHash] = params
        const session = sessions.get(tokenHash)
        return session && session.expiresAt > Date.now() && accounts.has(session.accountId) ? [accounts.get(session.accountId)] : []
      }

      if (normalized.startsWith('delete from verdun_account_session')) {
        if (normalized.includes('token_hash = $1') && normalized.includes('expires_at <= now()')) {
          const [tokenHash] = params
          const session = sessions.get(tokenHash)
          if (session && session.expiresAt <= Date.now()) {
            sessions.delete(tokenHash)
            return [{ token_hash: tokenHash }]
          }
          return []
        }
        if (normalized.includes('expires_at <= now()')) {
          const now = Date.now()
          const expired = Array.from(sessions.entries()).filter(([, session]) => session.expiresAt <= now)
          for (const [tokenHash] of expired) sessions.delete(tokenHash)
          return expired.map(([tokenHash]) => ({ token_hash: tokenHash }))
        }
        const [tokenHash] = params
        const session = sessions.get(tokenHash)
        sessions.delete(tokenHash)
        return session ? [{ account_id: session.accountId }] : []
      }

      if (normalized.startsWith('select coalesce(max(used), 0)::integer as used, current_date::text as window_start from verdun_account_usage')) {
        const [accountId, capability] = params
        return [{ used: usage.get(`${accountId}:${capability}`) ?? 0, window_start: dbCurrentDate }]
      }

      if (normalized.startsWith('with usage_window as')) {
        const [accountId, capability, subjectId, limit] = params
        const key = `${accountId}:${capability}`
        const subjectKey = `${accountId}:${capability}:${subjectId}`
        if (usageSubjects.has(subjectKey)) {
          return [{ existing_subject_count: 1, inserted_subject_count: 0, incremented_usage_count: 0 }]
        }
        if ((usage.get(key) ?? 0) >= limit) {
          return [{ existing_subject_count: 0, inserted_subject_count: 0, incremented_usage_count: 0 }]
        }
        usageSubjects.add(subjectKey)
        if (subjectIncrementMisses.delete(subjectId)) {
          usageSubjects.delete(subjectKey)
          return [{ existing_subject_count: 0, inserted_subject_count: 1, incremented_usage_count: 0 }]
        }
        usage.set(key, (usage.get(key) ?? 0) + 1)
        return [{ existing_subject_count: 0, inserted_subject_count: 1, incremented_usage_count: 1 }]
      }

      if (normalized.startsWith('insert into verdun_account_usage ')) {
        if (normalized.includes('values ($1, $2, current_date, 0)')) {
          const [accountId, capability] = params
          const key = `${accountId}:${capability}`
          if (!usage.has(key)) usage.set(key, 0)
          return []
        }
        const [accountId, capability, limit] = params
        const key = `${accountId}:${capability}`
        const next = (usage.get(key) ?? 0) + 1
        if (next > limit) return []
        usage.set(key, next)
        return [{ used: next }]
      }

      throw new Error(`unexpected SQL in smoke: ${normalized}`)
    },
  }
}
