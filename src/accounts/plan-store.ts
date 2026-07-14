import type { VerdunAccountSql } from './store.js'
import {
  isVerdunPlanTransitionDeliveryState,
  isVerdunSubscriptionStatus,
  normalizeVerdunPlanCurrency,
  normalizeVerdunPlanDate,
  normalizeVerdunPlanDescription,
  normalizeVerdunPlanDisplayName,
  normalizeVerdunPlanIdentifier,
  normalizeVerdunPlanJsonObject,
  normalizeVerdunPlanProviderId,
  type VerdunApplication,
  type VerdunBillingCustomer,
  type VerdunPlan,
  type VerdunPlanAssignmentResult,
  type VerdunPlanFamily,
  type VerdunPlanJsonObject,
  type VerdunPlanPrice,
  type VerdunPlanTransition,
  type VerdunPlanTransitionDeliveryState,
  type VerdunProviderSubscriptionResult,
  type VerdunRecurringInterval,
  type VerdunResolvedPlan,
  type VerdunSubscription,
  type VerdunSubscriptionStatus,
} from './plan-types.js'

export type VerdunPlanSql = VerdunAccountSql

export type UpsertVerdunApplicationInput = {
  applicationKey: string
  displayName: string
  isActive?: boolean
}

export type UpsertVerdunPlanFamilyInput = {
  applicationKey: string
  familyKey: string
  displayName: string
  description?: string | null
  isActive?: boolean
}

export type UpsertVerdunPlanInput = {
  applicationKey: string
  familyKey: string
  planKey: string
  displayName: string
  description?: string | null
  entitlements?: VerdunPlanJsonObject
  isDefault?: boolean
  isActive?: boolean
}

export type UpsertVerdunPlanPriceInput = {
  applicationKey: string
  familyKey: string
  planKey: string
  provider: string
  providerPriceId: string
  currency: string
  unitAmountMinor: number
  recurringInterval: VerdunRecurringInterval
  recurringIntervalCount?: number
  isActive?: boolean
  metadata?: VerdunPlanJsonObject
}

export type UpsertVerdunBillingCustomerInput = {
  applicationKey: string
  accountId: string
  provider: string
  providerCustomerId: string
  metadata?: VerdunPlanJsonObject
}

export type AssignVerdunManualPlanInput = {
  applicationKey: string
  accountId: string
  familyKey: string
  planKey: string
  actorAccountId?: string | null
  reason?: string | null
  metadata?: VerdunPlanJsonObject
  confirmationDeliveryState?: 'pending' | 'suppressed'
}

export type UpsertVerdunProviderSubscriptionInput = {
  applicationKey: string
  accountId: string
  familyKey: string
  planKey: string
  status: VerdunSubscriptionStatus
  provider: string
  providerCustomerId: string
  providerSubscriptionId: string
  providerPriceId?: string | null
  providerEventId: string
  providerEventAt: string | Date
  currentPeriodStart?: string | Date | null
  currentPeriodEnd?: string | Date | null
  trialEnd?: string | Date | null
  cancelAt?: string | Date | null
  canceledAt?: string | Date | null
  metadata?: VerdunPlanJsonObject
  eventPayload?: VerdunPlanJsonObject
  reason?: string | null
  confirmationDeliveryState?: 'pending' | 'suppressed'
}

export type ResolveVerdunAccountPlanInput = {
  applicationKey: string
  accountId: string
  familyKey: string
  entitledStatuses?: Iterable<VerdunSubscriptionStatus>
}

export type ListVerdunPlanTransitionsInput = {
  applicationKey: string
  accountId: string
  familyKey: string
  limit?: number
}

export type VerdunPlanTransitionConfirmation = {
  transition: VerdunPlanTransition
  recipientEmail: string
  applicationDisplayName: string
  familyDisplayName: string
  fromPlanDisplayName: string | null
  toPlanDisplayName: string
}

type ApplicationRow = {
  application_key: string
  display_name: string
  is_active: boolean
  created_at: string
  updated_at: string
}

type PlanFamilyRow = {
  application_key: string
  family_key: string
  display_name: string
  description: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

type PlanRow = {
  application_key: string
  family_key: string
  plan_key: string
  display_name: string
  description: string | null
  entitlements: VerdunPlanJsonObject | string
  is_default: boolean
  is_active: boolean
  created_at: string
  updated_at: string
}

type PlanPriceRow = {
  id: string
  application_key: string
  family_key: string
  plan_key: string
  provider: string
  provider_price_id: string
  currency: string
  unit_amount_minor: number | string
  recurring_interval: VerdunRecurringInterval
  recurring_interval_count: number | string
  is_active: boolean
  metadata: VerdunPlanJsonObject | string
  created_at: string
  updated_at: string
}

type BillingCustomerRow = {
  application_key: string
  account_id: string
  provider: string
  provider_customer_id: string
  metadata: VerdunPlanJsonObject | string
  created_at: string
  updated_at: string
}

type SubscriptionRow = {
  id: string
  application_key: string
  account_id: string
  family_key: string
  plan_key: string
  source: 'manual' | 'provider'
  status: VerdunSubscriptionStatus
  provider: string | null
  provider_customer_id: string | null
  provider_subscription_id: string | null
  provider_price_id: string | null
  current_period_start: string | null
  current_period_end: string | null
  trial_end: string | null
  cancel_at: string | null
  canceled_at: string | null
  last_provider_event_id: string | null
  last_provider_event_at: string | null
  metadata: VerdunPlanJsonObject | string
  created_at: string
  updated_at: string
}

type TransitionRow = {
  id: string
  subscription_id: string | null
  application_key: string
  account_id: string
  family_key: string
  from_plan_key: string | null
  to_plan_key: string
  from_status: VerdunSubscriptionStatus | null
  to_status: VerdunSubscriptionStatus
  source: 'manual' | 'provider'
  actor_account_id: string | null
  reason: string | null
  provider: string | null
  provider_event_id: string | null
  metadata: VerdunPlanJsonObject | string
  confirmation_delivery_state: VerdunPlanTransitionDeliveryState
  confirmation_delivery_attempts: number | string
  confirmation_last_attempt_at: string | null
  confirmation_delivered_at: string | null
  confirmation_suppressed_at: string | null
  confirmation_delivery_error: string | null
  created_at: string
}

const defaultEntitledStatuses = ['active', 'trialing'] as const satisfies readonly VerdunSubscriptionStatus[]
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab0-9a-f]{4}-[0-9a-f]{12}$/i

export async function upsertVerdunApplication(
  sql: VerdunPlanSql,
  input: UpsertVerdunApplicationInput,
): Promise<VerdunApplication> {
  const applicationKey = normalizeVerdunPlanIdentifier(input.applicationKey, 'applicationKey')
  const displayName = normalizeVerdunPlanDisplayName(input.displayName, 'displayName')
  const rows = await sql.query(
    `insert into verdun_application (application_key, display_name, is_active)
     values ($1, $2, $3)
     on conflict (application_key) do update
     set display_name = excluded.display_name,
         is_active = excluded.is_active,
         updated_at = now()
     returning *`,
    [applicationKey, displayName, input.isActive ?? true],
  ) as ApplicationRow[]
  return applicationFromRow(requiredRow(rows[0], 'verdun_application_upsert_failed'))
}

export async function upsertVerdunPlanFamily(
  sql: VerdunPlanSql,
  input: UpsertVerdunPlanFamilyInput,
): Promise<VerdunPlanFamily> {
  const applicationKey = normalizeVerdunPlanIdentifier(input.applicationKey, 'applicationKey')
  const familyKey = normalizeVerdunPlanIdentifier(input.familyKey, 'familyKey')
  const displayName = normalizeVerdunPlanDisplayName(input.displayName, 'displayName')
  const description = normalizeVerdunPlanDescription(input.description ?? null, 'description')
  const rows = await sql.query(
    `insert into verdun_plan_family (application_key, family_key, display_name, description, is_active)
     values ($1, $2, $3, $4, $5)
     on conflict (application_key, family_key) do update
     set display_name = excluded.display_name,
         description = excluded.description,
         is_active = excluded.is_active,
         updated_at = now()
     returning *`,
    [applicationKey, familyKey, displayName, description, input.isActive ?? true],
  ) as PlanFamilyRow[]
  return planFamilyFromRow(requiredRow(rows[0], 'verdun_plan_family_upsert_failed'))
}

export async function upsertVerdunPlan(
  sql: VerdunPlanSql,
  input: UpsertVerdunPlanInput,
): Promise<VerdunPlan> {
  const applicationKey = normalizeVerdunPlanIdentifier(input.applicationKey, 'applicationKey')
  const familyKey = normalizeVerdunPlanIdentifier(input.familyKey, 'familyKey')
  const planKey = normalizeVerdunPlanIdentifier(input.planKey, 'planKey')
  const displayName = normalizeVerdunPlanDisplayName(input.displayName, 'displayName')
  const description = normalizeVerdunPlanDescription(input.description ?? null, 'description')
  const entitlements = normalizeVerdunPlanJsonObject(input.entitlements ?? {}, 'entitlements')
  const isDefault = input.isDefault ?? false
  const rows = await sql.query(
    `with plan_lock as materialized (
       select pg_advisory_xact_lock(hashtextextended('verdun:plan-catalog:' || $1 || ':' || $2, 0))
     ),
     cleared_default as (
       update verdun_plan
       set is_default = false, updated_at = now()
       from plan_lock
       where application_key = $1
         and family_key = $2
         and plan_key <> $3
         and $7::boolean
         and is_default
       returning plan_key
     ),
     upserted as (
       insert into verdun_plan (
         application_key, family_key, plan_key, display_name, description,
         entitlements, is_default, is_active
       )
       select $1, $2, $3, $4, $5, $6::jsonb, $7, $8
       from (select count(*) from cleared_default) default_clearance
       on conflict (application_key, family_key, plan_key) do update
       set display_name = excluded.display_name,
           description = excluded.description,
           entitlements = excluded.entitlements,
           is_default = excluded.is_default,
           is_active = excluded.is_active,
           updated_at = now()
       returning *
     )
     select * from upserted`,
    [
      applicationKey,
      familyKey,
      planKey,
      displayName,
      description,
      JSON.stringify(entitlements),
      isDefault,
      input.isActive ?? true,
    ],
  ) as PlanRow[]
  return planFromRow(requiredRow(rows[0], 'verdun_plan_upsert_failed'))
}

export async function upsertVerdunPlanPrice(
  sql: VerdunPlanSql,
  input: UpsertVerdunPlanPriceInput,
): Promise<VerdunPlanPrice> {
  const applicationKey = normalizeVerdunPlanIdentifier(input.applicationKey, 'applicationKey')
  const familyKey = normalizeVerdunPlanIdentifier(input.familyKey, 'familyKey')
  const planKey = normalizeVerdunPlanIdentifier(input.planKey, 'planKey')
  const provider = normalizeVerdunPlanIdentifier(input.provider, 'provider')
  const providerPriceId = normalizeVerdunPlanProviderId(input.providerPriceId, 'providerPriceId')
  const currency = normalizeVerdunPlanCurrency(input.currency)
  const unitAmountMinor = nonNegativeSafeInteger(input.unitAmountMinor, 'unitAmountMinor')
  const recurringInterval = normalizeRecurringInterval(input.recurringInterval)
  const recurringIntervalCount = positiveSafeInteger(input.recurringIntervalCount ?? 1, 'recurringIntervalCount', 1000)
  const metadata = normalizeVerdunPlanJsonObject(input.metadata ?? {}, 'metadata')
  const rows = await sql.query(
    `insert into verdun_plan_price (
       application_key, family_key, plan_key, provider, provider_price_id,
       currency, unit_amount_minor, recurring_interval, recurring_interval_count,
       is_active, metadata
     ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)
     on conflict (provider, provider_price_id) do update
     set currency = excluded.currency,
         unit_amount_minor = excluded.unit_amount_minor,
         recurring_interval = excluded.recurring_interval,
         recurring_interval_count = excluded.recurring_interval_count,
         is_active = excluded.is_active,
         metadata = excluded.metadata,
         updated_at = now()
     where verdun_plan_price.application_key = excluded.application_key
       and verdun_plan_price.family_key = excluded.family_key
       and verdun_plan_price.plan_key = excluded.plan_key
     returning *`,
    [
      applicationKey,
      familyKey,
      planKey,
      provider,
      providerPriceId,
      currency,
      unitAmountMinor,
      recurringInterval,
      recurringIntervalCount,
      input.isActive ?? true,
      JSON.stringify(metadata),
    ],
  ) as PlanPriceRow[]
  if (!rows[0]) throw new Error('verdun_plan_price_conflict')
  return planPriceFromRow(rows[0])
}

export async function upsertVerdunBillingCustomer(
  sql: VerdunPlanSql,
  input: UpsertVerdunBillingCustomerInput,
): Promise<VerdunBillingCustomer> {
  const applicationKey = normalizeVerdunPlanIdentifier(input.applicationKey, 'applicationKey')
  const accountId = normalizeAccountId(input.accountId, 'accountId')
  const provider = normalizeVerdunPlanIdentifier(input.provider, 'provider')
  const providerCustomerId = normalizeVerdunPlanProviderId(input.providerCustomerId, 'providerCustomerId')
  const metadata = normalizeVerdunPlanJsonObject(input.metadata ?? {}, 'metadata')
  const rows = await sql.query(
    `insert into verdun_billing_customer (
       application_key, account_id, provider, provider_customer_id, metadata
     ) values ($1, $2, $3, $4, $5::jsonb)
     on conflict (application_key, account_id, provider) do update
     set provider_customer_id = excluded.provider_customer_id,
         metadata = excluded.metadata,
         updated_at = now()
     returning *`,
    [applicationKey, accountId, provider, providerCustomerId, JSON.stringify(metadata)],
  ) as BillingCustomerRow[]
  return billingCustomerFromRow(requiredRow(rows[0], 'verdun_billing_customer_upsert_failed'))
}

export async function verdunBillingCustomerByProviderId(
  sql: VerdunPlanSql,
  input: Pick<UpsertVerdunBillingCustomerInput, 'applicationKey' | 'provider' | 'providerCustomerId'>,
): Promise<VerdunBillingCustomer | null> {
  const applicationKey = normalizeVerdunPlanIdentifier(input.applicationKey, 'applicationKey')
  const provider = normalizeVerdunPlanIdentifier(input.provider, 'provider')
  const providerCustomerId = normalizeVerdunPlanProviderId(input.providerCustomerId, 'providerCustomerId')
  const rows = await sql.query(
    `select * from verdun_billing_customer
     where application_key = $1 and provider = $2 and provider_customer_id = $3
     limit 1`,
    [applicationKey, provider, providerCustomerId],
  ) as BillingCustomerRow[]
  return rows[0] ? billingCustomerFromRow(rows[0]) : null
}

export async function assignVerdunManualPlan(
  sql: VerdunPlanSql,
  input: AssignVerdunManualPlanInput,
): Promise<VerdunPlanAssignmentResult> {
  const applicationKey = normalizeVerdunPlanIdentifier(input.applicationKey, 'applicationKey')
  const accountId = normalizeAccountId(input.accountId, 'accountId')
  const familyKey = normalizeVerdunPlanIdentifier(input.familyKey, 'familyKey')
  const planKey = normalizeVerdunPlanIdentifier(input.planKey, 'planKey')
  const actorAccountId = input.actorAccountId ? normalizeAccountId(input.actorAccountId, 'actorAccountId') : null
  const reason = normalizeReason(input.reason)
  const metadata = normalizeVerdunPlanJsonObject(input.metadata ?? {}, 'metadata')
  const deliveryState = normalizeInitialDeliveryState(input.confirmationDeliveryState)
  const rows = await sql.query(
     `with assignment_lock as materialized (
       select pg_advisory_xact_lock(hashtextextended('verdun:plan:' || $1 || ':' || $2::uuid::text || ':' || $3, 0))
     ),
     target_plan as materialized (
       select plan.*
       from verdun_plan plan
       join verdun_plan_family family
         on family.application_key = plan.application_key and family.family_key = plan.family_key
       join verdun_application application
         on application.application_key = plan.application_key
       cross join assignment_lock
       where plan.application_key = $1
         and plan.family_key = $3
         and plan.plan_key = $4
         and plan.is_active
         and family.is_active
         and application.is_active
     ),
     previous as materialized (
       select subscription.*
       from verdun_subscription subscription
       cross join assignment_lock
       where subscription.application_key = $1
         and subscription.account_id = $2
         and subscription.family_key = $3
       limit 1
     ),
     upserted as (
       insert into verdun_subscription (
         application_key, account_id, family_key, plan_key, source, status, metadata
       )
       select $1, $2, $3, target_plan.plan_key, 'manual', 'active', $7::jsonb
       from target_plan
       on conflict (application_key, account_id, family_key) do update
       set plan_key = excluded.plan_key,
           source = 'manual',
           status = 'active',
           provider = null,
           provider_customer_id = null,
           provider_subscription_id = null,
           provider_price_id = null,
           current_period_start = null,
           current_period_end = null,
           trial_end = null,
           cancel_at = null,
           canceled_at = null,
           last_provider_event_id = null,
           last_provider_event_at = null,
           metadata = excluded.metadata,
           updated_at = now()
       where (
         verdun_subscription.plan_key,
         verdun_subscription.source,
         verdun_subscription.status,
         verdun_subscription.provider,
         verdun_subscription.provider_customer_id,
         verdun_subscription.provider_subscription_id,
         verdun_subscription.provider_price_id,
         verdun_subscription.current_period_start,
         verdun_subscription.current_period_end,
         verdun_subscription.trial_end,
         verdun_subscription.cancel_at,
         verdun_subscription.canceled_at,
         verdun_subscription.last_provider_event_id,
         verdun_subscription.last_provider_event_at,
         verdun_subscription.metadata
       ) is distinct from (
         excluded.plan_key,
         excluded.source,
         excluded.status,
         excluded.provider,
         excluded.provider_customer_id,
         excluded.provider_subscription_id,
         excluded.provider_price_id,
         excluded.current_period_start,
         excluded.current_period_end,
         excluded.trial_end,
         excluded.cancel_at,
         excluded.canceled_at,
         excluded.last_provider_event_id,
         excluded.last_provider_event_at,
         excluded.metadata
       )
       returning *
     ),
     current_subscription as (
       select * from upserted
       union all
       select previous.*
       from previous
       cross join target_plan
       where not exists (select 1 from upserted)
       limit 1
     ),
     transition as (
       insert into verdun_plan_transition (
         subscription_id, application_key, account_id, family_key,
         from_plan_key, to_plan_key, from_status, to_status, source,
         actor_account_id, reason, metadata, confirmation_delivery_state
       )
       select
         upserted.id, upserted.application_key, upserted.account_id, upserted.family_key,
         previous.plan_key, upserted.plan_key, previous.status, upserted.status, 'manual',
         $5, $6, upserted.metadata, $8
       from upserted
       left join previous on true
       returning *
     )
     select
       to_jsonb(current_subscription) as subscription_row,
       (select to_jsonb(transition) from transition limit 1) as transition_row,
       exists (select 1 from upserted) as changed
     from current_subscription`,
    [
      applicationKey,
      accountId,
      familyKey,
      planKey,
      actorAccountId,
      reason,
      JSON.stringify(metadata),
      deliveryState,
    ],
  ) as Array<{ subscription_row: SubscriptionRow | string, transition_row: TransitionRow | string | null, changed: boolean }>
  if (!rows[0]) throw new Error('verdun_manual_plan_target_not_found')
  return {
    subscription: subscriptionFromRow(jsonRow<SubscriptionRow>(rows[0].subscription_row)),
    transition: rows[0].transition_row ? transitionFromRow(jsonRow<TransitionRow>(rows[0].transition_row)) : null,
    changed: rows[0].changed,
  }
}

export async function upsertVerdunProviderSubscription(
  sql: VerdunPlanSql,
  input: UpsertVerdunProviderSubscriptionInput,
): Promise<VerdunProviderSubscriptionResult> {
  const applicationKey = normalizeVerdunPlanIdentifier(input.applicationKey, 'applicationKey')
  const accountId = normalizeAccountId(input.accountId, 'accountId')
  const familyKey = normalizeVerdunPlanIdentifier(input.familyKey, 'familyKey')
  const planKey = normalizeVerdunPlanIdentifier(input.planKey, 'planKey')
  if (!isVerdunSubscriptionStatus(input.status)) throw new Error('verdun_subscription_status_invalid')
  const provider = normalizeVerdunPlanIdentifier(input.provider, 'provider')
  const providerCustomerId = normalizeVerdunPlanProviderId(input.providerCustomerId, 'providerCustomerId')
  const providerSubscriptionId = normalizeVerdunPlanProviderId(input.providerSubscriptionId, 'providerSubscriptionId')
  const providerPriceId = input.providerPriceId
    ? normalizeVerdunPlanProviderId(input.providerPriceId, 'providerPriceId')
    : null
  const providerEventId = normalizeVerdunPlanProviderId(input.providerEventId, 'providerEventId')
  const providerEventAt = normalizeVerdunPlanDate(input.providerEventAt, 'providerEventAt')
  if (!providerEventAt) throw new Error('verdun_provider_event_date_invalid')
  const metadata = normalizeVerdunPlanJsonObject(input.metadata ?? {}, 'metadata')
  const eventPayload = normalizeVerdunPlanJsonObject(input.eventPayload ?? {}, 'eventPayload')
  const reason = normalizeReason(input.reason)
  const deliveryState = normalizeInitialDeliveryState(input.confirmationDeliveryState)
  const rows = await sql.query(
     `with assignment_lock as materialized (
       select pg_advisory_xact_lock(hashtextextended('verdun:plan:' || $1 || ':' || $2::uuid::text || ':' || $3, 0))
     ),
     target as materialized (
       select plan.*
       from verdun_plan plan
       join verdun_plan_family family
         on family.application_key = plan.application_key and family.family_key = plan.family_key
       join verdun_application application
         on application.application_key = plan.application_key
       join verdun_billing_customer customer
         on customer.application_key = plan.application_key
        and customer.account_id = $2
        and customer.provider = $6
        and customer.provider_customer_id = $7
       cross join assignment_lock
       where plan.application_key = $1
         and plan.family_key = $3
         and plan.plan_key = $4
         and (
           $9::text is null
           or exists (
             select 1 from verdun_plan_price price
             where price.application_key = plan.application_key
               and price.family_key = plan.family_key
               and price.plan_key = plan.plan_key
               and price.provider = $6
               and price.provider_price_id = $9
           )
         )
     ),
     existing_event as materialized (
       select event.*
       from verdun_subscription_provider_event event
       cross join assignment_lock
       where event.provider = $6 and event.provider_event_id = $10
       limit 1
     ),
     previous as materialized (
       select subscription.*
       from verdun_subscription subscription
       cross join assignment_lock
       where subscription.application_key = $1
         and subscription.account_id = $2
         and subscription.family_key = $3
       limit 1
     ),
     event_candidate as (
       select
         $6::text as provider,
         $10::text as provider_event_id,
         $1::text as application_key,
         $2::uuid as account_id,
         $3::text as family_key,
         $8::text as provider_subscription_id,
         $11::timestamptz as event_created_at,
         $18::jsonb as payload,
         case
           when (select source from previous) = 'manual'
             and $11::timestamptz < (select updated_at from previous)
           then 'stale'
           when not exists (select 1 from previous)
             or (select last_provider_event_at from previous) is null
             or $11::timestamptz >= (select last_provider_event_at from previous)
           then 'applied'
           else 'stale'
         end as outcome
       from target
       where not exists (select 1 from existing_event)
     ),
     event_inserted as (
       insert into verdun_subscription_provider_event (
         provider, provider_event_id, application_key, account_id, family_key,
         provider_subscription_id, event_created_at, payload, outcome, processed_at
       )
       select
         provider, provider_event_id, application_key, account_id, family_key,
         provider_subscription_id, event_created_at, payload, outcome, now()
       from event_candidate
       on conflict (provider, provider_event_id) do nothing
       returning *
     ),
     applicable_event as (
       select event_inserted.*
       from event_inserted
       where event_inserted.outcome = 'applied'
     ),
     upserted as (
       insert into verdun_subscription (
         application_key, account_id, family_key, plan_key, source, status,
         provider, provider_customer_id, provider_subscription_id, provider_price_id,
         current_period_start, current_period_end, trial_end, cancel_at, canceled_at,
         last_provider_event_id, last_provider_event_at, metadata
       )
       select
         $1, $2, $3, target.plan_key, 'provider', $5,
         $6, $7, $8, $9,
         $12, $13, $14, $15, $16,
         $10, applicable_event.event_created_at, $17::jsonb
       from target
       join applicable_event on true
       on conflict (application_key, account_id, family_key) do update
       set plan_key = excluded.plan_key,
           source = 'provider',
           status = excluded.status,
           provider = excluded.provider,
           provider_customer_id = excluded.provider_customer_id,
           provider_subscription_id = excluded.provider_subscription_id,
           provider_price_id = excluded.provider_price_id,
           current_period_start = excluded.current_period_start,
           current_period_end = excluded.current_period_end,
           trial_end = excluded.trial_end,
           cancel_at = excluded.cancel_at,
           canceled_at = excluded.canceled_at,
           last_provider_event_id = excluded.last_provider_event_id,
           last_provider_event_at = excluded.last_provider_event_at,
           metadata = excluded.metadata,
           updated_at = now()
       returning *
     ),
     meaningful_change as (
       select upserted.*
       from upserted
       left join previous on true
       where previous.id is null
          or (
            previous.plan_key,
            previous.source,
            previous.status,
            previous.provider,
            previous.provider_customer_id,
            previous.provider_subscription_id,
            previous.provider_price_id,
            previous.current_period_start,
            previous.current_period_end,
            previous.trial_end,
            previous.cancel_at,
            previous.canceled_at,
            previous.metadata
          ) is distinct from (
            upserted.plan_key,
            upserted.source,
            upserted.status,
            upserted.provider,
            upserted.provider_customer_id,
            upserted.provider_subscription_id,
            upserted.provider_price_id,
            upserted.current_period_start,
            upserted.current_period_end,
            upserted.trial_end,
            upserted.cancel_at,
            upserted.canceled_at,
            upserted.metadata
          )
     ),
     transition as (
       insert into verdun_plan_transition (
         subscription_id, application_key, account_id, family_key,
         from_plan_key, to_plan_key, from_status, to_status, source,
         reason, provider, provider_event_id, metadata, confirmation_delivery_state
       )
       select
         meaningful_change.id, meaningful_change.application_key,
         meaningful_change.account_id, meaningful_change.family_key,
         previous.plan_key, meaningful_change.plan_key, previous.status,
         meaningful_change.status, 'provider', $19, $6, $10,
         meaningful_change.metadata, $20
       from meaningful_change
       left join previous on true
       returning *
     ),
     current_subscription as (
       select * from upserted
       union all
       select previous.* from previous where not exists (select 1 from upserted)
       limit 1
     )
     select
       (select to_jsonb(current_subscription) from current_subscription limit 1) as subscription_row,
       (select to_jsonb(transition) from transition limit 1) as transition_row,
       case
         when exists (select 1 from existing_event) then 'duplicate'
         else coalesce((select outcome from event_inserted limit 1), 'stale')
       end as event_outcome,
       exists (select 1 from meaningful_change) as changed,
       exists (
         select 1 from existing_event
         where existing_event.application_key <> $1
            or existing_event.account_id <> $2
            or existing_event.family_key <> $3
            or existing_event.provider_subscription_id <> $8
       ) as event_conflict
     from target
     limit 1`,
    [
      applicationKey,
      accountId,
      familyKey,
      planKey,
      input.status,
      provider,
      providerCustomerId,
      providerSubscriptionId,
      providerPriceId,
      providerEventId,
      providerEventAt,
      normalizeVerdunPlanDate(input.currentPeriodStart ?? null, 'currentPeriodStart'),
      normalizeVerdunPlanDate(input.currentPeriodEnd ?? null, 'currentPeriodEnd'),
      normalizeVerdunPlanDate(input.trialEnd ?? null, 'trialEnd'),
      normalizeVerdunPlanDate(input.cancelAt ?? null, 'cancelAt'),
      normalizeVerdunPlanDate(input.canceledAt ?? null, 'canceledAt'),
      JSON.stringify(metadata),
      JSON.stringify(eventPayload),
      reason,
      deliveryState,
    ],
  ) as Array<{
    subscription_row: SubscriptionRow | string | null
    transition_row: TransitionRow | string | null
    event_outcome: 'applied' | 'stale' | 'duplicate'
    changed: boolean
    event_conflict: boolean
  }>
  if (!rows[0]) throw new Error('verdun_provider_subscription_target_not_found')
  if (rows[0].event_conflict) throw new Error('verdun_provider_event_conflict')
  if (!rows[0].subscription_row) throw new Error('verdun_provider_subscription_state_missing')
  return {
    subscription: subscriptionFromRow(jsonRow<SubscriptionRow>(rows[0].subscription_row)),
    transition: rows[0].transition_row ? transitionFromRow(jsonRow<TransitionRow>(rows[0].transition_row)) : null,
    changed: rows[0].changed,
    eventOutcome: rows[0].event_outcome,
  }
}

export async function resolveVerdunAccountPlan(
  sql: VerdunPlanSql,
  input: ResolveVerdunAccountPlanInput,
): Promise<VerdunResolvedPlan> {
  const applicationKey = normalizeVerdunPlanIdentifier(input.applicationKey, 'applicationKey')
  const accountId = normalizeAccountId(input.accountId, 'accountId')
  const familyKey = normalizeVerdunPlanIdentifier(input.familyKey, 'familyKey')
  const entitledStatuses = normalizeEntitledStatuses(input.entitledStatuses)
  const rows = await sql.query(
    `with active_family as materialized (
       select family.*
       from verdun_plan_family family
       join verdun_application application using (application_key)
       join verdun_account account on account.id = $2 and account.status = 'active'
       where family.application_key = $1
         and family.family_key = $3
         and family.is_active
         and application.is_active
     ),
     current_subscription as materialized (
       select subscription.*
       from verdun_subscription subscription
       join active_family family
         on family.application_key = subscription.application_key
        and family.family_key = subscription.family_key
       where subscription.application_key = $1
         and subscription.account_id = $2
         and subscription.family_key = $3
       limit 1
     ),
     entitled_subscription as materialized (
       select * from current_subscription where status = any($4::text[])
     ),
     selected as (
       select plan.*, 'subscription'::text as resolved_source
       from entitled_subscription subscription
       join verdun_plan plan
         on plan.application_key = subscription.application_key
        and plan.family_key = subscription.family_key
        and plan.plan_key = subscription.plan_key
       union all
       select plan.*, 'default'::text as resolved_source
       from verdun_plan plan
       join active_family family
         on family.application_key = plan.application_key and family.family_key = plan.family_key
       where plan.is_default and plan.is_active
         and not exists (select 1 from entitled_subscription)
       limit 1
     )
     select
       selected.*,
       (select to_jsonb(current_subscription) from current_subscription limit 1) as subscription_row
     from selected`,
    [applicationKey, accountId, familyKey, entitledStatuses],
  ) as Array<PlanRow & { resolved_source: 'subscription' | 'default', subscription_row: SubscriptionRow | string | null }>
  if (!rows[0]) throw new Error('verdun_default_plan_not_found')
  const plan = planFromRow(rows[0])
  const subscription = rows[0].subscription_row
    ? subscriptionFromRow(jsonRow<SubscriptionRow>(rows[0].subscription_row))
    : null
  return {
    applicationKey,
    accountId,
    familyKey,
    source: rows[0].resolved_source,
    plan,
    subscription,
    isDefaultFallback: rows[0].resolved_source === 'default',
  }
}

export async function verdunPlanTransition(
  sql: VerdunPlanSql,
  transitionId: string,
): Promise<VerdunPlanTransition | null> {
  const id = normalizeAccountId(transitionId, 'transitionId')
  const rows = await sql.query(
    `select * from verdun_plan_transition where id = $1 limit 1`,
    [id],
  ) as TransitionRow[]
  return rows[0] ? transitionFromRow(rows[0]) : null
}

export async function listVerdunPlanTransitions(
  sql: VerdunPlanSql,
  input: ListVerdunPlanTransitionsInput,
): Promise<VerdunPlanTransition[]> {
  const applicationKey = normalizeVerdunPlanIdentifier(input.applicationKey, 'applicationKey')
  const accountId = normalizeAccountId(input.accountId, 'accountId')
  const familyKey = normalizeVerdunPlanIdentifier(input.familyKey, 'familyKey')
  const limit = positiveSafeInteger(input.limit ?? 50, 'limit', 250)
  const rows = await sql.query(
    `select *
     from verdun_plan_transition
     where application_key = $1 and account_id = $2 and family_key = $3
     order by created_at desc, id desc
     limit $4`,
    [applicationKey, accountId, familyKey, limit],
  ) as TransitionRow[]
  return rows.map(transitionFromRow)
}

export async function claimVerdunPlanTransitionConfirmation(
  sql: VerdunPlanSql,
  transitionId: string,
  options: { retryFailed?: boolean } = {},
): Promise<VerdunPlanTransitionConfirmation | null> {
  const id = normalizeAccountId(transitionId, 'transitionId')
  const claimableStates = options.retryFailed ? ['pending', 'failed'] : ['pending']
  const rows = await sql.query(
    `with claimed as (
       update verdun_plan_transition
       set confirmation_delivery_state = 'sending',
           confirmation_delivery_attempts = confirmation_delivery_attempts + 1,
           confirmation_last_attempt_at = now(),
           confirmation_delivery_error = null
       where id = $1 and confirmation_delivery_state = any($2::text[])
       returning *
     )
     select
       to_jsonb(claimed) as transition_row,
       account.email as recipient_email,
       application.display_name as application_display_name,
       family.display_name as family_display_name,
       previous_plan.display_name as from_plan_display_name,
       next_plan.display_name as to_plan_display_name
     from claimed
     join verdun_account account on account.id = claimed.account_id
     join verdun_application application on application.application_key = claimed.application_key
     join verdun_plan_family family
       on family.application_key = claimed.application_key and family.family_key = claimed.family_key
     join verdun_plan next_plan
       on next_plan.application_key = claimed.application_key
      and next_plan.family_key = claimed.family_key
      and next_plan.plan_key = claimed.to_plan_key
     left join verdun_plan previous_plan
       on previous_plan.application_key = claimed.application_key
      and previous_plan.family_key = claimed.family_key
      and previous_plan.plan_key = claimed.from_plan_key`,
    [id, claimableStates],
  ) as Array<{
    transition_row: TransitionRow | string
    recipient_email: string
    application_display_name: string
    family_display_name: string
    from_plan_display_name: string | null
    to_plan_display_name: string
  }>
  if (!rows[0]) return null
  return {
    transition: transitionFromRow(jsonRow<TransitionRow>(rows[0].transition_row)),
    recipientEmail: rows[0].recipient_email,
    applicationDisplayName: rows[0].application_display_name,
    familyDisplayName: rows[0].family_display_name,
    fromPlanDisplayName: rows[0].from_plan_display_name,
    toPlanDisplayName: rows[0].to_plan_display_name,
  }
}

export async function markVerdunPlanTransitionConfirmation(
  sql: VerdunPlanSql,
  transitionId: string,
  state: Extract<VerdunPlanTransitionDeliveryState, 'sent' | 'suppressed' | 'failed'>,
  error?: string | null,
): Promise<VerdunPlanTransition> {
  const id = normalizeAccountId(transitionId, 'transitionId')
  if (!isVerdunPlanTransitionDeliveryState(state) || !['sent', 'suppressed', 'failed'].includes(state)) {
    throw new Error('verdun_plan_transition_delivery_state_invalid')
  }
  const normalizedError = state === 'failed' ? normalizeDeliveryError(error) : null
  const allowedCurrentStates = state === 'suppressed' ? ['pending', 'sending'] : ['sending']
  const rows = await sql.query(
    `update verdun_plan_transition
     set confirmation_delivery_state = $2,
         confirmation_delivered_at = case when $2 = 'sent' then now() else confirmation_delivered_at end,
         confirmation_suppressed_at = case when $2 = 'suppressed' then now() else confirmation_suppressed_at end,
         confirmation_delivery_error = $3
     where id = $1 and confirmation_delivery_state = any($4::text[])
     returning *`,
    [id, state, normalizedError, allowedCurrentStates],
  ) as TransitionRow[]
  if (!rows[0]) throw new Error('verdun_plan_transition_delivery_not_claimed')
  return transitionFromRow(rows[0])
}

function applicationFromRow(row: ApplicationRow): VerdunApplication {
  return {
    applicationKey: row.application_key,
    displayName: row.display_name,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function planFamilyFromRow(row: PlanFamilyRow): VerdunPlanFamily {
  return {
    applicationKey: row.application_key,
    familyKey: row.family_key,
    displayName: row.display_name,
    description: row.description,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function planFromRow(row: PlanRow): VerdunPlan {
  return {
    applicationKey: row.application_key,
    familyKey: row.family_key,
    planKey: row.plan_key,
    displayName: row.display_name,
    description: row.description,
    entitlements: jsonObjectFromRow(row.entitlements, 'entitlements'),
    isDefault: row.is_default,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function planPriceFromRow(row: PlanPriceRow): VerdunPlanPrice {
  return {
    id: row.id,
    applicationKey: row.application_key,
    familyKey: row.family_key,
    planKey: row.plan_key,
    provider: row.provider,
    providerPriceId: row.provider_price_id,
    currency: row.currency,
    unitAmountMinor: Number(row.unit_amount_minor),
    recurringInterval: row.recurring_interval,
    recurringIntervalCount: Number(row.recurring_interval_count),
    isActive: row.is_active,
    metadata: jsonObjectFromRow(row.metadata, 'metadata'),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function billingCustomerFromRow(row: BillingCustomerRow): VerdunBillingCustomer {
  return {
    applicationKey: row.application_key,
    accountId: row.account_id,
    provider: row.provider,
    providerCustomerId: row.provider_customer_id,
    metadata: jsonObjectFromRow(row.metadata, 'metadata'),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function subscriptionFromRow(row: SubscriptionRow): VerdunSubscription {
  return {
    id: row.id,
    applicationKey: row.application_key,
    accountId: row.account_id,
    familyKey: row.family_key,
    planKey: row.plan_key,
    source: row.source,
    status: row.status,
    provider: row.provider,
    providerCustomerId: row.provider_customer_id,
    providerSubscriptionId: row.provider_subscription_id,
    providerPriceId: row.provider_price_id,
    currentPeriodStart: row.current_period_start,
    currentPeriodEnd: row.current_period_end,
    trialEnd: row.trial_end,
    cancelAt: row.cancel_at,
    canceledAt: row.canceled_at,
    lastProviderEventId: row.last_provider_event_id,
    lastProviderEventAt: row.last_provider_event_at,
    metadata: jsonObjectFromRow(row.metadata, 'metadata'),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function transitionFromRow(row: TransitionRow): VerdunPlanTransition {
  return {
    id: row.id,
    subscriptionId: row.subscription_id,
    applicationKey: row.application_key,
    accountId: row.account_id,
    familyKey: row.family_key,
    fromPlanKey: row.from_plan_key,
    toPlanKey: row.to_plan_key,
    fromStatus: row.from_status,
    toStatus: row.to_status,
    source: row.source,
    actorAccountId: row.actor_account_id,
    reason: row.reason,
    provider: row.provider,
    providerEventId: row.provider_event_id,
    metadata: jsonObjectFromRow(row.metadata, 'metadata'),
    confirmationDeliveryState: row.confirmation_delivery_state,
    confirmationDeliveryAttempts: Number(row.confirmation_delivery_attempts),
    confirmationLastAttemptAt: row.confirmation_last_attempt_at,
    confirmationDeliveredAt: row.confirmation_delivered_at,
    confirmationSuppressedAt: row.confirmation_suppressed_at,
    confirmationDeliveryError: row.confirmation_delivery_error,
    createdAt: row.created_at,
  }
}

function normalizeEntitledStatuses(values?: Iterable<VerdunSubscriptionStatus>): VerdunSubscriptionStatus[] {
  const statuses = [...new Set(values ? Array.from(values) : defaultEntitledStatuses)]
  if (!statuses.length || statuses.some((status) => !isVerdunSubscriptionStatus(status))) {
    throw new Error('verdun_subscription_status_invalid')
  }
  return statuses
}

function normalizeAccountId(value: unknown, field: string): string {
  if (typeof value !== 'string' || !uuidPattern.test(value.trim())) throw new Error(`verdun_${field}_invalid`)
  return value.trim().toLowerCase()
}

function normalizeRecurringInterval(value: unknown): VerdunRecurringInterval {
  if (value !== 'day' && value !== 'week' && value !== 'month' && value !== 'year') {
    throw new Error('verdun_recurring_interval_invalid')
  }
  return value
}

function normalizeInitialDeliveryState(value: unknown): 'pending' | 'suppressed' {
  if (value === undefined) return 'pending'
  if (value !== 'pending' && value !== 'suppressed') {
    throw new Error('verdun_plan_transition_delivery_state_invalid')
  }
  return value
}

function normalizeReason(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string') throw new Error('verdun_plan_transition_reason_invalid')
  const normalized = value.trim()
  if (!normalized || normalized.length > 500) throw new Error('verdun_plan_transition_reason_invalid')
  return normalized
}

function normalizeDeliveryError(value: unknown): string {
  const normalized = value instanceof Error ? value.message.trim() : typeof value === 'string' ? value.trim() : ''
  return (normalized || 'confirmation_delivery_failed').slice(0, 2000)
}

function nonNegativeSafeInteger(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new Error(`verdun_${field}_invalid`)
  return value
}

function positiveSafeInteger(value: unknown, field: string, maximum: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new Error(`verdun_${field}_invalid`)
  }
  return value
}

function requiredRow<T>(row: T | undefined, error: string): T {
  if (!row) throw new Error(error)
  return row
}

function jsonRow<T>(value: T | string): T {
  return typeof value === 'string' ? JSON.parse(value) as T : value
}

function jsonObjectFromRow(value: VerdunPlanJsonObject | string, field: string): VerdunPlanJsonObject {
  return normalizeVerdunPlanJsonObject(typeof value === 'string' ? JSON.parse(value) : value, field)
}
