#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { Client } from 'pg'
import {
  authenticateVerdunEmailPassword,
  completeVerdunEmailChallenge,
  hashVerdunEmailCode,
  hashVerdunEmailLinkToken,
  requestVerdunEmailChallenge,
} from '../lib/src/accounts/email-auth.js'
import {
  hashVerdunSessionToken,
  upsertVerdunGoogleAccount,
} from '../lib/src/accounts/store.js'

const databaseName = `verdun_auth_integration_${process.pid}`
const pepper = 'local-integration-pepper-with-at-least-32-bytes'
const postgresReady = spawnSync('pg_isready', ['--quiet'])
if (postgresReady.error || postgresReady.status !== 0) {
  console.log('Verdun real PostgreSQL email-auth integration skipped: local PostgreSQL is unavailable')
  process.exit(0)
}
const admin = new Client({ database: 'postgres', host: '/tmp' })
let client
const auxiliaryClients = []

await admin.connect()
try {
  await admin.query(`create database ${databaseName}`)
  client = new Client({ database: databaseName, host: '/tmp' })
  await client.connect()
  const sql = { query: async (text, params = []) => (await client.query(text, params)).rows }

  await client.query(await readFile(new URL('../db/migrations/0004_accounts.sql', import.meta.url), 'utf8'))
  const identityMigration = await readFile(new URL('../db/migrations/0005_multi_identity_auth.sql', import.meta.url), 'utf8')
  await client.query(identityMigration)

  const google = await upsertVerdunGoogleAccount(sql, {
    sub: 'google-person',
    email: 'person@example.test',
    name: 'Person',
    pictureUrl: null,
  }, [])
  const registration = await requestVerdunEmailChallenge(sql, {
    purpose: 'verify_email',
    email: google.email,
    password: 'initial-password-value',
    authPepper: pepper,
    ipAddress: '192.0.2.1',
  })
  assert(registration, 'Google account should be eligible to link an email/password identity')
  const storedChallenge = (await client.query(
    'select token_hash, code_hash, pending_password_hash from verdun_auth_challenge where id = $1',
    [registration.id],
  )).rows[0]
  assert(storedChallenge.token_hash === hashVerdunEmailLinkToken(registration.token), 'stored token hash mismatch')
  assert(storedChallenge.code_hash === hashVerdunEmailCode(registration.id, registration.code, pepper), 'stored code hash mismatch')
  assert(!JSON.stringify(storedChallenge).includes(registration.token), 'database leaked raw link token')
  assert(!JSON.stringify(storedChallenge).includes(registration.code), 'database leaked raw six-digit code')

  const linked = await completeVerdunEmailChallenge(sql, {
    challengeId: registration.id,
    purpose: 'verify_email',
    proof: { kind: 'code', code: registration.code },
    authPepper: pepper,
    ipAddress: '192.0.2.1',
  })
  assert(linked.account.id === google.id, 'Google to email linking changed the account id')
  const linkedIdentities = (await client.query(
    'select provider, password_hash is not null as has_password from verdun_account_identity where account_id = $1 order by provider',
    [google.id],
  )).rows
  assert(linkedIdentities.length === 2, `expected two linked identities, got ${JSON.stringify(linkedIdentities)}`)
  assert(linkedIdentities.some((row) => row.provider === 'google' && !row.has_password), 'Google identity missing')
  assert(linkedIdentities.some((row) => row.provider === 'email' && row.has_password), 'email/password identity missing')
  await expectError(() => completeVerdunEmailChallenge(sql, {
    challengeId: registration.id,
    purpose: 'verify_email',
    proof: { kind: 'link', token: registration.token },
    authPepper: pepper,
    ipAddress: '192.0.2.1',
  }), 'email_challenge_invalid')

  const passwordLogin = await authenticateVerdunEmailPassword(sql, {
    email: google.email,
    password: 'initial-password-value',
    authPepper: pepper,
    ipAddress: '192.0.2.1',
  })
  assert(passwordLogin.account.id === google.id, 'password login resolved a different account')
  const duplicateRegistration = await requestVerdunEmailChallenge(sql, {
    purpose: 'verify_email',
    email: google.email,
    password: 'should-not-overwrite-password',
    authPepper: pepper,
    ipAddress: '192.0.2.1',
  })
  assert(duplicateRegistration === null, 'existing email/password signup should be suppressed')
  await client.query("delete from verdun_auth_rate_bucket where scope = 'email_challenge:email'")

  const reset = await requestVerdunEmailChallenge(sql, {
    purpose: 'password_reset',
    email: google.email,
    authPepper: pepper,
    ipAddress: '192.0.2.1',
  })
  assert(reset, 'password reset challenge was suppressed for an existing active account')
  await expectError(() => completeVerdunEmailChallenge(sql, {
    challengeId: reset.id,
    purpose: 'password_reset',
    proof: { kind: 'code', code: reset.code === '999999' ? '888888' : '999999' },
    newPassword: 'replacement-password-value',
    authPepper: pepper,
    ipAddress: '192.0.2.1',
  }), 'email_challenge_invalid')
  const attempts = Number((await client.query('select attempts from verdun_auth_challenge where id = $1', [reset.id])).rows[0].attempts)
  assert(attempts === 1, `wrong reset code should consume one attempt, got ${attempts}`)
  const resetLogin = await completeVerdunEmailChallenge(sql, {
    challengeId: reset.id,
    purpose: 'password_reset',
    proof: { kind: 'link', token: reset.token },
    newPassword: 'replacement-password-value',
    authPepper: pepper,
    ipAddress: '192.0.2.1',
  })
  assert(resetLogin.account.id === google.id, 'password reset changed account id')
  const survivingSessionHashes = (await client.query(
    'select token_hash from verdun_account_session where account_id = $1',
    [google.id],
  )).rows.map((row) => row.token_hash)
  assert(!survivingSessionHashes.includes(hashVerdunSessionToken(linked.sessionToken)), 'reset did not revoke registration session')
  assert(!survivingSessionHashes.includes(hashVerdunSessionToken(passwordLogin.sessionToken)), 'reset did not revoke password session')
  assert(survivingSessionHashes.includes(hashVerdunSessionToken(resetLogin.sessionToken)), 'reset did not create a replacement session')
  await expectError(() => authenticateVerdunEmailPassword(sql, {
    email: google.email,
    password: 'initial-password-value',
    authPepper: pepper,
    ipAddress: '192.0.2.1',
  }), 'invalid_email_or_password')
  const newPasswordLogin = await authenticateVerdunEmailPassword(sql, {
    email: google.email,
    password: 'replacement-password-value',
    authPepper: pepper,
    ipAddress: '192.0.2.1',
  })
  assert(newPasswordLogin.account.id === google.id, 'new password did not sign into the same account')

  const passwordless = await requestVerdunEmailChallenge(sql, {
    purpose: 'passwordless_login',
    email: google.email,
    authPepper: pepper,
    ipAddress: '192.0.2.1',
  })
  assert(passwordless, 'passwordless challenge was suppressed for an existing account')
  const passwordlessLogin = await completeVerdunEmailChallenge(sql, {
    challengeId: passwordless.id,
    purpose: 'passwordless_login',
    proof: { kind: 'link', token: passwordless.token },
    authPepper: pepper,
    ipAddress: '192.0.2.1',
  })
  assert(passwordlessLogin.account.id === google.id, 'passwordless login changed account id')

  await expectError(() => upsertVerdunGoogleAccount(sql, {
    sub: 'different-google-subject',
    email: google.email,
    name: 'Conflict',
    pictureUrl: null,
  }, []), 'google_account_identity_conflict')

  const emailFirstRegistration = await requestVerdunEmailChallenge(sql, {
    purpose: 'verify_email',
    email: 'email-first@example.test',
    password: 'email-first-password',
    authPepper: pepper,
    ipAddress: '192.0.2.2',
  })
  assert(emailFirstRegistration, 'email-first registration was suppressed')
  const emailFirst = await completeVerdunEmailChallenge(sql, {
    challengeId: emailFirstRegistration.id,
    purpose: 'verify_email',
    proof: { kind: 'code', code: emailFirstRegistration.code },
    authPepper: pepper,
    ipAddress: '192.0.2.2',
  })
  const emailFirstGoogle = await upsertVerdunGoogleAccount(sql, {
    sub: 'google-email-first',
    email: 'email-first@example.test',
    name: 'Email First',
    pictureUrl: null,
  }, [])
  assert(emailFirstGoogle.id === emailFirst.account.id, 'email to Google linking changed the account id')

  await client.query(identityMigration)
  const identitiesAfterReplay = Number((await client.query(
    'select count(*)::int as count from verdun_account_identity where account_id = $1',
    [emailFirst.account.id],
  )).rows[0].count)
  assert(identitiesAfterReplay === 2, `migration replay changed linked identities: ${identitiesAfterReplay}`)

  const concurrentEmail = 'concurrent@example.test'
  const concurrentClientA = new Client({ database: databaseName, host: '/tmp' })
  const concurrentClientB = new Client({ database: databaseName, host: '/tmp' })
  auxiliaryClients.push(concurrentClientA, concurrentClientB)
  await Promise.all([concurrentClientA.connect(), concurrentClientB.connect()])
  const concurrentSqlA = { query: async (text, params = []) => (await concurrentClientA.query(text, params)).rows }
  const concurrentSqlB = { query: async (text, params = []) => (await concurrentClientB.query(text, params)).rows }
  const [firstConcurrent, secondConcurrent] = await Promise.all([
    requestVerdunEmailChallenge(concurrentSqlA, {
      purpose: 'verify_email', email: concurrentEmail, password: 'concurrent-password-a', authPepper: pepper, ipAddress: '192.0.2.3',
    }),
    requestVerdunEmailChallenge(concurrentSqlB, {
      purpose: 'verify_email', email: concurrentEmail, password: 'concurrent-password-b', authPepper: pepper, ipAddress: '192.0.2.3',
    }),
  ])
  assert(firstConcurrent && secondConcurrent, 'concurrent issuances should each receive their own delivery payload')
  const activeChallenges = Number((await client.query(
    `select count(*)::int as count from verdun_auth_challenge
     where email = $1 and purpose = 'verify_email' and consumed_at is null and superseded_at is null`,
    [concurrentEmail],
  )).rows[0].count)
  assert(activeChallenges === 1, `concurrent issuance left ${activeChallenges} active challenges`)

  const activeConcurrentId = (await client.query(
    `select id from verdun_auth_challenge
     where email = $1 and purpose = 'verify_email' and consumed_at is null and superseded_at is null`,
    [concurrentEmail],
  )).rows[0].id
  const activeConcurrent = [firstConcurrent, secondConcurrent].find((item) => item.id === activeConcurrentId)
  assert(activeConcurrent, 'could not match the active concurrent challenge to its delivery payload')
  let deadlockTimer
  const deadlockGuard = new Promise((_, reject) => {
    deadlockTimer = setTimeout(() => reject(new Error('concurrent resend/completion deadlocked')), 5_000)
  })
  const resendCompletionRace = await Promise.race([
    Promise.allSettled([
      completeVerdunEmailChallenge(concurrentSqlA, {
        challengeId: activeConcurrent.id,
        purpose: 'verify_email',
        proof: { kind: 'code', code: activeConcurrent.code },
        authPepper: pepper,
        ipAddress: '192.0.2.3',
      }),
      requestVerdunEmailChallenge(concurrentSqlB, {
        purpose: 'verify_email', email: concurrentEmail, password: 'concurrent-password-c', authPepper: pepper, ipAddress: '192.0.2.3',
      }),
    ]),
    deadlockGuard,
  ])
  clearTimeout(deadlockTimer)
  assert(resendCompletionRace.length === 2, 'concurrent resend/completion did not settle both operations')
  assert(resendCompletionRace.some((result) => result.status === 'fulfilled'), 'concurrent resend/completion rejected both safe outcomes')
  for (const result of resendCompletionRace) {
    if (result.status !== 'rejected') continue
    const reason = result.reason
    assert(reason?.code !== '40P01', 'concurrent resend/completion encountered a PostgreSQL deadlock')
    assert(reason instanceof Error && reason.message === 'email_challenge_invalid', `unexpected concurrent loser: ${String(reason)}`)
  }

  const lockoutRegistration = await requestVerdunEmailChallenge(sql, {
    purpose: 'verify_email', email: 'lockout@example.test', password: 'lockout-password-value', authPepper: pepper, ipAddress: '192.0.2.4',
  })
  assert(lockoutRegistration, 'lockout registration was suppressed')
  const wrongLockoutCode = lockoutRegistration.code === '999999' ? '888888' : '999999'
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await expectError(() => completeVerdunEmailChallenge(sql, {
      challengeId: lockoutRegistration.id,
      purpose: 'verify_email',
      proof: { kind: 'code', code: wrongLockoutCode },
      authPepper: pepper,
      ipAddress: '192.0.2.4',
    }), 'email_challenge_invalid')
  }
  await expectError(() => completeVerdunEmailChallenge(sql, {
    challengeId: lockoutRegistration.id,
    purpose: 'verify_email',
    proof: { kind: 'code', code: lockoutRegistration.code },
    authPepper: pepper,
    ipAddress: '192.0.2.4',
  }), 'email_challenge_invalid')
  const lockedOut = (await client.query(
    'select attempts, consumed_at from verdun_auth_challenge where id = $1',
    [lockoutRegistration.id],
  )).rows[0]
  assert(Number(lockedOut.attempts) === 5 && lockedOut.consumed_at === null, 'five-attempt lockout did not fail closed')

  console.log('Verdun real PostgreSQL email-auth integration passed')
} finally {
  await Promise.all(auxiliaryClients.map((auxiliaryClient) => auxiliaryClient.end().catch(() => undefined)))
  if (client) await client.end().catch(() => undefined)
  await admin.query(`drop database if exists ${databaseName} with (force)`).catch(() => undefined)
  await admin.end().catch(() => undefined)
}

function assert(value, message) {
  if (!value) throw new Error(message)
}

async function expectError(action, message) {
  try {
    await action()
  } catch (error) {
    if (error instanceof Error && error.message === message) return
    throw error
  }
  throw new Error(`expected error ${message}`)
}
