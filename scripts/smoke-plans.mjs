#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Client } from 'pg'

const compile = spawnSync('node_modules/.bin/tsc', ['-p', 'tsconfig.package.json'], {
  cwd: new URL('..', import.meta.url),
  stdio: 'inherit',
})
if (compile.error) throw compile.error
if (compile.status !== 0) throw new Error(`Verdun plan smoke TypeScript compile exited with ${compile.status}`)

const planTypes = await import('../lib/src/accounts/plan-types.js')
const planStore = await import('../lib/src/accounts/plan-store.js')
const { deliverVerdunPlanTransitionConfirmation, verdunPlanTransitionEmail } = await import('../lib/src/accounts/plan-email.js')
const { upsertVerdunGoogleAccount } = await import('../lib/src/accounts/store.js')

assert(planTypes.normalizeVerdunPlanIdentifier(' Curtail_App ', 'applicationKey') === 'curtail_app', 'identifier normalization failed')
assert(planTypes.normalizeVerdunPlanCurrency('usd') === 'USD', 'currency normalization failed')
assert(planTypes.normalizeVerdunPlanDate(new Date('2026-07-14T12:00:00Z')) === '2026-07-14T12:00:00.000Z', 'date normalization failed')
assert(planTypes.normalizeVerdunPlanJsonObject({ max_domains: 5 }).max_domains === 5, 'entitlement JSON normalization failed')
await expectError(
  () => Promise.resolve(planTypes.normalizeVerdunPlanIdentifier('bad key', 'applicationKey')),
  'invalid_applicationkey',
)
const circular = {}
circular.self = circular
await expectError(
  () => Promise.resolve(planTypes.normalizeVerdunPlanJsonObject(circular, 'entitlements')),
  'invalid_entitlements',
)

const email = verdunPlanTransitionEmail({
  transitionId: 'transition-example',
  to: 'Person@Example.Test',
  applicationName: 'Curtail & Company',
  familyName: 'Consumer',
  planName: '<Pro>',
  previousPlanName: 'Free',
  status: 'active',
  source: 'manual',
  effectiveAt: '2026-07-14T12:00:00Z',
  manageUrl: 'https://example.test/account?tab=plan&from=email',
})
assert(email.to === 'person@example.test', 'confirmation recipient was not normalized')
assert(email.html?.includes('&lt;Pro&gt;') && !email.html.includes('<Pro>'), 'confirmation HTML was not escaped')
assert(email.headers?.['X-Entity-Ref-ID'] === 'transition-example', 'confirmation idempotency header missing')

if (!commandsAvailable(['initdb', 'pg_ctl'])) {
  console.log('Verdun application-plan PostgreSQL integration skipped: initdb/pg_ctl are unavailable')
  console.log('Verdun application plan smoke passed')
  process.exit(0)
}

const root = await mkdtemp(join(tmpdir(), 'verdun-plan-smoke-'))
const data = join(root, 'data')
const port = 55_000 + (process.pid % 1_000)
let serverStarted = false
let client
try {
  run('initdb', ['-D', data, '-A', 'trust', '-U', 'postgres', '--no-locale', '--encoding=UTF8'])
  run('pg_ctl', ['-D', data, '-o', `-F -h '' -k ${root} -p ${port}`, '-w', 'start'])
  serverStarted = true
  client = new Client({ database: 'postgres', host: root, port, user: 'postgres' })
  await client.connect()
  const sql = { query: async (text, params = []) => (await client.query(text, params)).rows }
  for (const migration of [
    '../db/migrations/0004_accounts.sql',
    '../db/migrations/0005_multi_identity_auth.sql',
    '../db/migrations/0006_application_plans.sql',
  ]) {
    await client.query(await readFile(new URL(migration, import.meta.url), 'utf8'))
  }

  const account = await upsertVerdunGoogleAccount(sql, {
    sub: 'plans-person',
    email: 'person@example.test',
    name: 'Plan Person',
    pictureUrl: null,
  }, [])
  const defaultAccount = await upsertVerdunGoogleAccount(sql, {
    sub: 'plans-default-person',
    email: 'default-person@example.test',
    name: 'Default Person',
    pictureUrl: null,
  }, [])

  await planStore.upsertVerdunApplication(sql, {
    applicationKey: 'shared_app',
    displayName: 'Shared App',
  })
  await planStore.upsertVerdunPlanFamily(sql, {
    applicationKey: 'shared_app',
    familyKey: 'consumer',
    displayName: 'Consumer',
  })
  await planStore.upsertVerdunPlanFamily(sql, {
    applicationKey: 'shared_app',
    familyKey: 'broker',
    displayName: 'Broker',
  })
  await planStore.upsertVerdunPlan(sql, {
    applicationKey: 'shared_app', familyKey: 'consumer', planKey: 'free', displayName: 'Free',
    entitlements: { max_domains: 1, analytics: false }, isDefault: true,
  })
  await planStore.upsertVerdunPlan(sql, {
    applicationKey: 'shared_app', familyKey: 'consumer', planKey: 'pro', displayName: 'Pro',
    entitlements: { max_domains: 25, analytics: true },
  })
  await planStore.upsertVerdunPlan(sql, {
    applicationKey: 'shared_app', familyKey: 'broker', planKey: 'starter', displayName: 'Starter',
    entitlements: { max_clients: 10 }, isDefault: true,
  })
  await planStore.upsertVerdunPlan(sql, {
    applicationKey: 'shared_app', familyKey: 'broker', planKey: 'enterprise', displayName: 'Enterprise',
    entitlements: { max_clients: 1000 },
  })

  const defaultPlan = await planStore.resolveVerdunAccountPlan(sql, {
    applicationKey: 'shared_app', accountId: defaultAccount.id, familyKey: 'consumer',
  })
  assert(defaultPlan.source === 'default' && defaultPlan.plan.planKey === 'free', 'default plan resolution failed')
  assert(defaultPlan.subscription === null && defaultPlan.isDefaultFallback, 'default resolution returned a subscription')

  const consumerAssignment = await planStore.assignVerdunManualPlan(sql, {
    applicationKey: 'shared_app', accountId: account.id, familyKey: 'consumer', planKey: 'pro',
    actorAccountId: account.id, reason: 'integration smoke', metadata: { channel: 'manual' },
  })
  const brokerAssignment = await planStore.assignVerdunManualPlan(sql, {
    applicationKey: 'shared_app', accountId: account.id, familyKey: 'broker', planKey: 'starter',
    metadata: { channel: 'manual' },
  })
  assert(consumerAssignment.changed && brokerAssignment.changed, 'first manual assignments should change state')
  assert(consumerAssignment.subscription.id !== brokerAssignment.subscription.id, 'plan families did not get independent subscriptions')
  const idempotentManual = await planStore.assignVerdunManualPlan(sql, {
    applicationKey: 'shared_app', accountId: account.id, familyKey: 'consumer', planKey: 'pro',
    actorAccountId: account.id, reason: 'integration smoke', metadata: { channel: 'manual' },
  })
  assert(!idempotentManual.changed && idempotentManual.transition === null, 'identical manual assignment was not idempotent')

  const consumerResolved = await planStore.resolveVerdunAccountPlan(sql, {
    applicationKey: 'shared_app', accountId: account.id, familyKey: 'consumer',
  })
  const brokerResolved = await planStore.resolveVerdunAccountPlan(sql, {
    applicationKey: 'shared_app', accountId: account.id, familyKey: 'broker',
  })
  assert(consumerResolved.plan.planKey === 'pro' && brokerResolved.plan.planKey === 'starter', 'independent family resolution failed')

  const price = await planStore.upsertVerdunPlanPrice(sql, {
    applicationKey: 'shared_app', familyKey: 'consumer', planKey: 'pro', provider: 'stripe',
    providerPriceId: 'price_pro', currency: 'usd', unitAmountMinor: 2500, recurringInterval: 'month',
  })
  assert(price.currency === 'USD' && price.unitAmountMinor === 2500, 'recurring price mapping failed')
  await expectError(() => planStore.upsertVerdunPlanPrice(sql, {
    applicationKey: 'shared_app', familyKey: 'consumer', planKey: 'free', provider: 'stripe',
    providerPriceId: 'price_pro', currency: 'USD', unitAmountMinor: 0, recurringInterval: 'month',
  }), 'verdun_plan_price_conflict')

  await planStore.upsertVerdunBillingCustomer(sql, {
    applicationKey: 'shared_app', accountId: account.id, provider: 'stripe', providerCustomerId: 'cus_person',
  })
  const customer = await planStore.verdunBillingCustomerByProviderId(sql, {
    applicationKey: 'shared_app', provider: 'stripe', providerCustomerId: 'cus_person',
  })
  assert(customer?.accountId === account.id, 'provider customer lookup failed')

  const providerActiveAt = new Date(Date.now() + 60_000).toISOString()
  const providerPeriodEnd = new Date(Date.now() + 31 * 24 * 60 * 60 * 1000).toISOString()
  const providerStaleAt = new Date(Date.now() - 60_000).toISOString()
  const providerCanceledAt = new Date(Date.now() + 120_000).toISOString()

  const delayedBeforeManual = await planStore.upsertVerdunProviderSubscription(sql, {
    applicationKey: 'shared_app', accountId: account.id, familyKey: 'consumer', planKey: 'pro',
    status: 'past_due', provider: 'stripe', providerCustomerId: 'cus_person',
    providerSubscriptionId: 'sub_consumer', providerPriceId: 'price_pro',
    providerEventId: 'evt_before_manual', providerEventAt: providerStaleAt,
    metadata: { channel: 'stripe' }, eventPayload: { type: 'subscription.updated' },
  })
  assert(
    delayedBeforeManual.eventOutcome === 'stale'
      && delayedBeforeManual.subscription.source === 'manual'
      && !delayedBeforeManual.changed,
    'provider event older than a manual assignment replaced manual state',
  )

  const providerActive = await planStore.upsertVerdunProviderSubscription(sql, {
    applicationKey: 'shared_app', accountId: account.id, familyKey: 'consumer', planKey: 'pro',
    status: 'active', provider: 'stripe', providerCustomerId: 'cus_person',
    providerSubscriptionId: 'sub_consumer', providerPriceId: 'price_pro',
    providerEventId: 'evt_active', providerEventAt: providerActiveAt,
    currentPeriodStart: providerActiveAt, currentPeriodEnd: providerPeriodEnd,
    metadata: { channel: 'stripe' }, eventPayload: { type: 'subscription.updated' },
  })
  assert(
    providerActive.eventOutcome === 'applied' && providerActive.changed,
    `provider state did not replace manual state: ${JSON.stringify(providerActive)}`,
  )
  const duplicate = await planStore.upsertVerdunProviderSubscription(sql, {
    applicationKey: 'shared_app', accountId: account.id, familyKey: 'consumer', planKey: 'pro',
    status: 'active', provider: 'stripe', providerCustomerId: 'cus_person',
    providerSubscriptionId: 'sub_consumer', providerPriceId: 'price_pro',
    providerEventId: 'evt_active', providerEventAt: providerActiveAt,
    currentPeriodStart: providerActiveAt, currentPeriodEnd: providerPeriodEnd,
    metadata: { channel: 'stripe' }, eventPayload: { type: 'subscription.updated' },
  })
  assert(duplicate.eventOutcome === 'duplicate' && !duplicate.changed && duplicate.transition === null, 'provider event replay was not idempotent')
  const stale = await planStore.upsertVerdunProviderSubscription(sql, {
    applicationKey: 'shared_app', accountId: account.id, familyKey: 'consumer', planKey: 'pro',
    status: 'past_due', provider: 'stripe', providerCustomerId: 'cus_person',
    providerSubscriptionId: 'sub_consumer', providerPriceId: 'price_pro',
    providerEventId: 'evt_stale', providerEventAt: providerStaleAt,
    metadata: { channel: 'stripe' }, eventPayload: { type: 'subscription.updated' },
  })
  assert(stale.eventOutcome === 'stale' && !stale.changed, 'out-of-order provider event changed current state')
  await expectError(() => planStore.upsertVerdunProviderSubscription(sql, {
    applicationKey: 'shared_app', accountId: account.id, familyKey: 'broker', planKey: 'starter',
    status: 'active', provider: 'stripe', providerCustomerId: 'cus_person',
    providerSubscriptionId: 'sub_broker', providerEventId: 'evt_active',
    providerEventAt: providerActiveAt,
  }), 'verdun_provider_event_conflict')

  const canceled = await planStore.upsertVerdunProviderSubscription(sql, {
    applicationKey: 'shared_app', accountId: account.id, familyKey: 'consumer', planKey: 'pro',
    status: 'canceled', provider: 'stripe', providerCustomerId: 'cus_person',
    providerSubscriptionId: 'sub_consumer', providerPriceId: 'price_pro',
    providerEventId: 'evt_canceled', providerEventAt: providerCanceledAt,
    canceledAt: providerCanceledAt, metadata: { channel: 'stripe' },
    eventPayload: { type: 'subscription.deleted' },
  })
  assert(canceled.changed && canceled.transition, 'provider cancellation did not create a transition')
  const canceledResolution = await planStore.resolveVerdunAccountPlan(sql, {
    applicationKey: 'shared_app', accountId: account.id, familyKey: 'consumer',
  })
  assert(canceledResolution.source === 'default' && canceledResolution.plan.planKey === 'free', 'canceled subscription did not fall back to default')
  assert(canceledResolution.subscription?.status === 'canceled', 'default fallback hid current subscription state')
  const stillBroker = await planStore.resolveVerdunAccountPlan(sql, {
    applicationKey: 'shared_app', accountId: account.id, familyKey: 'broker',
  })
  assert(stillBroker.plan.planKey === 'starter', 'consumer cancellation altered the broker family')

  let sends = 0
  const sender = async () => {
    sends += 1
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  const deliveries = await Promise.all([
    deliverVerdunPlanTransitionConfirmation(sql, sender, canceled.transition.id, {
      manageUrl: 'https://example.test/account/plan',
    }),
    deliverVerdunPlanTransitionConfirmation(sql, sender, canceled.transition.id, {
      manageUrl: 'https://example.test/account/plan',
    }),
  ])
  assert(sends === 1, `concurrent confirmation claims sent ${sends} messages`)
  assert(deliveries.some((result) => result.state === 'sent') && deliveries.some((result) => result.state === 'skipped'), 'confirmation claim results were not sent/skipped')
  const delivered = await planStore.verdunPlanTransition(sql, canceled.transition.id)
  assert(delivered?.confirmationDeliveryState === 'sent' && delivered.confirmationDeliveryAttempts === 1, 'confirmation delivery state was not persisted')
  const consumerHistory = await planStore.listVerdunPlanTransitions(sql, {
    applicationKey: 'shared_app', accountId: account.id, familyKey: 'consumer', limit: 10,
  })
  assert(consumerHistory.length === 3 && consumerHistory[0].id === canceled.transition.id, 'plan transition history is incomplete or unordered')

  const transitionCount = Number((await client.query('select count(*) from verdun_plan_transition')).rows[0].count)
  assert(transitionCount === 4, `expected four meaningful plan transitions, got ${transitionCount}`)
  const eventOutcomes = (await client.query(
    'select provider_event_id, outcome from verdun_subscription_provider_event order by provider_event_id',
  )).rows
  assert(eventOutcomes.some((row) => row.provider_event_id === 'evt_stale' && row.outcome === 'stale'), 'stale provider event audit missing')
} finally {
  if (client) await client.end().catch(() => undefined)
  if (serverStarted) spawnSync('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop'], { stdio: 'ignore' })
  await rm(root, { recursive: true, force: true })
}

console.log('Verdun application plan smoke passed')

function commandsAvailable(commands) {
  return commands.every((command) => {
    const result = spawnSync('sh', ['-c', `command -v ${command}`], { stdio: 'ignore' })
    return !result.error && result.status === 0
  })
}

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'ignore' })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${command} exited with ${result.status}`)
}

async function expectError(operation, message) {
  try {
    await operation()
  } catch (error) {
    if (error instanceof Error && error.message.includes(message)) return
    throw error
  }
  throw new Error(`expected error containing ${message}`)
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}
