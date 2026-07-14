export type VerdunPlanJsonPrimitive = string | number | boolean | null

export type VerdunPlanJsonValue =
  | VerdunPlanJsonPrimitive
  | VerdunPlanJsonValue[]
  | { [key: string]: VerdunPlanJsonValue }

export type VerdunPlanJsonObject = { [key: string]: VerdunPlanJsonValue }
export type VerdunPlanEntitlements = VerdunPlanJsonObject
export type VerdunPlanMetadata = VerdunPlanJsonObject

export const verdunPlanAssignmentSources = ['manual', 'provider'] as const
export type VerdunPlanAssignmentSource = typeof verdunPlanAssignmentSources[number]

export const verdunSubscriptionStatuses = [
  'incomplete',
  'trialing',
  'active',
  'past_due',
  'paused',
  'canceled',
  'unpaid',
] as const
export type VerdunSubscriptionStatus = typeof verdunSubscriptionStatuses[number]

export const verdunPlanTransitionDeliveryStates = [
  'pending',
  'sending',
  'sent',
  'suppressed',
  'failed',
] as const
export type VerdunPlanTransitionDeliveryState = typeof verdunPlanTransitionDeliveryStates[number]

export const verdunPlanRecurringIntervals = ['day', 'week', 'month', 'year'] as const
export type VerdunRecurringInterval = typeof verdunPlanRecurringIntervals[number]
export type VerdunPlanRecurringInterval = VerdunRecurringInterval

export type VerdunApplication = {
  applicationKey: string
  displayName: string
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export type VerdunPlanFamily = {
  applicationKey: string
  familyKey: string
  displayName: string
  description: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export type VerdunPlan = {
  applicationKey: string
  familyKey: string
  planKey: string
  displayName: string
  description: string | null
  entitlements: VerdunPlanEntitlements
  isDefault: boolean
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export type VerdunPlanPrice = {
  id: string
  applicationKey: string
  familyKey: string
  planKey: string
  provider: string
  providerPriceId: string
  currency: string
  unitAmountMinor: number
  recurringInterval: VerdunRecurringInterval
  recurringIntervalCount: number
  isActive: boolean
  metadata: VerdunPlanMetadata
  createdAt: string
  updatedAt: string
}

export type VerdunBillingCustomer = {
  applicationKey: string
  accountId: string
  provider: string
  providerCustomerId: string
  metadata: VerdunPlanMetadata
  createdAt: string
  updatedAt: string
}

/** Current state for one application/account/family tuple. */
export type VerdunSubscription = {
  id: string
  applicationKey: string
  accountId: string
  familyKey: string
  planKey: string
  source: VerdunPlanAssignmentSource
  status: VerdunSubscriptionStatus
  provider: string | null
  providerCustomerId: string | null
  providerSubscriptionId: string | null
  providerPriceId: string | null
  currentPeriodStart: string | null
  currentPeriodEnd: string | null
  trialEnd: string | null
  cancelAt: string | null
  canceledAt: string | null
  lastProviderEventId: string | null
  lastProviderEventAt: string | null
  metadata: VerdunPlanMetadata
  createdAt: string
  updatedAt: string
}

export type VerdunSubscriptionProviderEvent = {
  provider: string
  providerEventId: string
  applicationKey: string
  accountId: string
  familyKey: string
  providerSubscriptionId: string
  eventCreatedAt: string
  payload: VerdunPlanJsonObject
  outcome: 'processing' | 'applied' | 'stale' | 'failed'
  receivedAt: string
  processedAt: string | null
  error: string | null
}

export type VerdunPlanTransition = {
  id: string
  subscriptionId: string | null
  applicationKey: string
  accountId: string
  familyKey: string
  fromPlanKey: string | null
  toPlanKey: string
  fromStatus: VerdunSubscriptionStatus | null
  toStatus: VerdunSubscriptionStatus
  source: VerdunPlanAssignmentSource
  actorAccountId: string | null
  reason: string | null
  provider: string | null
  providerEventId: string | null
  metadata: VerdunPlanMetadata
  confirmationDeliveryState: VerdunPlanTransitionDeliveryState
  confirmationDeliveryAttempts: number
  confirmationLastAttemptAt: string | null
  confirmationDeliveredAt: string | null
  confirmationSuppressedAt: string | null
  confirmationDeliveryError: string | null
  createdAt: string
}

export type VerdunResolvedPlan = {
  applicationKey: string
  accountId: string
  familyKey: string
  source: 'subscription' | 'default'
  plan: VerdunPlan
  /** The current row is retained here even when its status caused a default fallback. */
  subscription: VerdunSubscription | null
  isDefaultFallback: boolean
}

export type VerdunPlanAssignmentResult = {
  changed: boolean
  subscription: VerdunSubscription
  transition: VerdunPlanTransition | null
}

export type VerdunProviderSubscriptionResult = VerdunPlanAssignmentResult & {
  eventOutcome: 'applied' | 'stale' | 'duplicate'
}

export type VerdunProviderSubscriptionUpsertResult = VerdunProviderSubscriptionResult
export type VerdunPlanProviderUpsertResult = VerdunProviderSubscriptionResult

const verdunPlanIdentifierPattern = /^[a-z][a-z0-9_-]{0,62}$/
const verdunPlanJsonMaximumBytes = 64 * 1024
const verdunPlanJsonMaximumDepth = 32

export function normalizeVerdunPlanIdentifier(value: unknown, field = 'plan_identifier'): string {
  if (typeof value !== 'string') throw verdunPlanValidationError(field)
  const normalized = value.trim().toLowerCase()
  if (!verdunPlanIdentifierPattern.test(normalized)) throw verdunPlanValidationError(field)
  return normalized
}

export function normalizeVerdunPlanDisplayName(value: unknown, field = 'plan_name'): string {
  if (typeof value !== 'string') throw verdunPlanValidationError(field)
  const normalized = value.trim()
  if (
    normalized.length === 0
    || normalized.length > 160
    || /[\u0000-\u001f\u007f]/.test(normalized)
  ) throw verdunPlanValidationError(field)
  return normalized
}

export function normalizeVerdunPlanDescription(
  value: unknown,
  field = 'plan_description',
): string | null {
  if (value === null || value === undefined) return null
  if (typeof value !== 'string') throw verdunPlanValidationError(field)
  const normalized = value.trim()
  if (!normalized) return null
  if (normalized.length > 2_000 || /\u0000/.test(normalized)) throw verdunPlanValidationError(field)
  return normalized
}

export function normalizeVerdunPlanProviderId(value: unknown, field = 'provider_id'): string {
  if (typeof value !== 'string') throw verdunPlanValidationError(field)
  const normalized = value.trim()
  if (
    normalized.length === 0
    || normalized.length > 255
    || /[\u0000-\u001f\u007f]/.test(normalized)
  ) throw verdunPlanValidationError(field)
  return normalized
}

export function normalizeVerdunPlanCurrency(value: unknown): string {
  if (typeof value !== 'string') throw new Error('invalid_plan_currency')
  const normalized = value.trim().toUpperCase()
  if (!/^[A-Z]{3}$/.test(normalized)) throw new Error('invalid_plan_currency')
  return normalized
}

/** Validate and clone a finite, acyclic JSON object with bounded depth and size. */
export function normalizeVerdunPlanJsonObject(
  value: unknown,
  field = 'plan_json',
): VerdunPlanJsonObject {
  if (!isPlainObject(value)) throw verdunPlanValidationError(field)
  validateVerdunPlanJson(value, field, new Set<object>(), 0)
  const encoded = JSON.stringify(value)
  if (Buffer.byteLength(encoded, 'utf8') > verdunPlanJsonMaximumBytes) {
    throw verdunPlanValidationError(field)
  }
  return JSON.parse(encoded) as VerdunPlanJsonObject
}

export function normalizeVerdunPlanDate(value: unknown, field = 'plan_date'): string | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value !== 'string' && !(value instanceof Date)) throw verdunPlanValidationError(field)
  const timestamp = value instanceof Date ? value.getTime() : Date.parse(value)
  if (!Number.isFinite(timestamp)) throw verdunPlanValidationError(field)
  return new Date(timestamp).toISOString()
}

export function isVerdunSubscriptionStatus(value: unknown): value is VerdunSubscriptionStatus {
  return typeof value === 'string'
    && verdunSubscriptionStatuses.includes(value as VerdunSubscriptionStatus)
}

export function isVerdunPlanTransitionDeliveryState(
  value: unknown,
): value is VerdunPlanTransitionDeliveryState {
  return typeof value === 'string'
    && verdunPlanTransitionDeliveryStates.includes(value as VerdunPlanTransitionDeliveryState)
}

function validateVerdunPlanJson(
  value: unknown,
  field: string,
  ancestors: Set<object>,
  depth: number,
): void {
  if (depth > verdunPlanJsonMaximumDepth) throw verdunPlanValidationError(field)
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw verdunPlanValidationError(field)
    return
  }
  if (typeof value !== 'object') throw verdunPlanValidationError(field)
  if (ancestors.has(value)) throw verdunPlanValidationError(field)
  ancestors.add(value)
  try {
    if (Array.isArray(value)) {
      for (const item of value) validateVerdunPlanJson(item, field, ancestors, depth + 1)
      return
    }
    if (!isPlainObject(value) || Object.getOwnPropertySymbols(value).length > 0) {
      throw verdunPlanValidationError(field)
    }
    for (const [key, item] of Object.entries(value)) {
      if (!key || key.length > 255 || /[\u0000-\u001f\u007f]/.test(key)) {
        throw verdunPlanValidationError(field)
      }
      validateVerdunPlanJson(item, field, ancestors, depth + 1)
    }
  } finally {
    ancestors.delete(value)
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function verdunPlanValidationError(field: string): Error {
  const normalizedField = String(field).trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_') || 'plan_value'
  return new Error(`invalid_${normalizedField}`)
}
