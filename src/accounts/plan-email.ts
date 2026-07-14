import type { EmailMessage, EmailSender } from '../../api/core/email.js'
import {
  claimVerdunPlanTransitionConfirmation,
  markVerdunPlanTransitionConfirmation,
  type VerdunPlanSql,
} from './plan-store.js'
import {
  normalizeVerdunPlanDate,
  normalizeVerdunPlanDisplayName,
  type VerdunPlanAssignmentSource,
  type VerdunSubscriptionStatus,
} from './plan-types.js'

export type VerdunPlanTransitionEmailInput = {
  transitionId: string
  to: string
  applicationName: string
  familyName: string
  planName: string
  previousPlanName?: string | null
  status: VerdunSubscriptionStatus
  source: VerdunPlanAssignmentSource
  effectiveAt: string
  manageUrl?: string | null
}

export type DeliverVerdunPlanTransitionConfirmationOptions = {
  manageUrl?: string | null
  retryFailed?: boolean
  suppress?: boolean
}

export type VerdunPlanTransitionConfirmationDeliveryResult = {
  transitionId: string
  state: 'sent' | 'suppressed' | 'skipped'
}

export function verdunPlanTransitionEmail(input: VerdunPlanTransitionEmailInput): EmailMessage {
  const transitionId = requiredSingleLine(input.transitionId, 'plan_transition_id', 255)
  const to = normalizeRecipient(input.to)
  const applicationName = normalizeVerdunPlanDisplayName(input.applicationName, 'application_name')
  const familyName = normalizeVerdunPlanDisplayName(input.familyName, 'plan_family_name')
  const planName = normalizeVerdunPlanDisplayName(input.planName, 'plan_name')
  const previousPlanName = input.previousPlanName
    ? normalizeVerdunPlanDisplayName(input.previousPlanName, 'previous_plan_name')
    : null
  const effectiveAt = normalizeVerdunPlanDate(input.effectiveAt, 'plan_effective_at')
  if (!effectiveAt) throw new Error('invalid_plan_effective_at')
  const manageUrl = normalizeManageUrl(input.manageUrl)
  const transitionText = previousPlanName && previousPlanName !== planName
    ? `Your ${familyName} plan changed from ${previousPlanName} to ${planName}.`
    : `Your ${familyName} plan is now ${planName}.`
  const statusText = `Subscription status: ${input.status}.`
  const sourceText = input.source === 'provider'
    ? 'This change was confirmed by the billing provider.'
    : 'This change was assigned directly by the application.'
  const subject = `${applicationName} plan confirmation: ${planName}`
  const text = [
    transitionText,
    '',
    statusText,
    `Effective at: ${effectiveAt}`,
    sourceText,
    ...(manageUrl ? ['', `Manage your plan: ${manageUrl}`] : []),
    '',
    'If you did not expect this change, contact the application administrator.',
  ].join('\n')
  const html = [
    `<p>${escapeVerdunPlanEmailHtml(transitionText)}</p>`,
    `<p>${escapeVerdunPlanEmailHtml(statusText)}<br>Effective at: ${escapeVerdunPlanEmailHtml(effectiveAt)}</p>`,
    `<p>${escapeVerdunPlanEmailHtml(sourceText)}</p>`,
    manageUrl
      ? `<p><a href="${escapeVerdunPlanEmailHtml(manageUrl)}">Manage your ${escapeVerdunPlanEmailHtml(familyName)} plan</a></p>`
      : '',
    '<p>If you did not expect this change, contact the application administrator.</p>',
  ].join('')
  return {
    to,
    subject,
    text,
    html,
    headers: { 'X-Entity-Ref-ID': transitionId },
  }
}

/**
 * Atomically claims a transition, sends one confirmation, and persists the
 * outcome. Concurrent callers receive `skipped` after the first claim wins.
 */
export async function deliverVerdunPlanTransitionConfirmation(
  sql: VerdunPlanSql,
  sender: EmailSender,
  transitionId: string,
  options: DeliverVerdunPlanTransitionConfirmationOptions = {},
): Promise<VerdunPlanTransitionConfirmationDeliveryResult> {
  const normalizedTransitionId = requiredSingleLine(transitionId, 'plan_transition_id', 255)
  const claim = await claimVerdunPlanTransitionConfirmation(sql, normalizedTransitionId, {
    retryFailed: options.retryFailed,
  })
  if (!claim) return { transitionId: normalizedTransitionId, state: 'skipped' }

  if (options.suppress) {
    await markVerdunPlanTransitionConfirmation(sql, normalizedTransitionId, 'suppressed')
    return { transitionId: normalizedTransitionId, state: 'suppressed' }
  }

  const message = verdunPlanTransitionEmail({
    transitionId: claim.transition.id,
    to: claim.recipientEmail,
    applicationName: claim.applicationDisplayName,
    familyName: claim.familyDisplayName,
    planName: claim.toPlanDisplayName,
    previousPlanName: claim.fromPlanDisplayName,
    status: claim.transition.toStatus,
    source: claim.transition.source,
    effectiveAt: claim.transition.createdAt,
    manageUrl: options.manageUrl,
  })
  try {
    await sender(message)
  } catch (error) {
    await markVerdunPlanTransitionConfirmation(
      sql,
      normalizedTransitionId,
      'failed',
      normalizeDeliveryError(error),
    ).catch(() => undefined)
    throw error
  }

  await markVerdunPlanTransitionConfirmation(sql, normalizedTransitionId, 'sent')
  return { transitionId: normalizedTransitionId, state: 'sent' }
}

export function escapeVerdunPlanEmailHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  })[character] ?? character)
}

function normalizeRecipient(value: unknown): string {
  if (typeof value !== 'string') throw new Error('invalid_plan_confirmation_email')
  const email = value.trim().toLowerCase()
  const at = email.lastIndexOf('@')
  if (
    !email
    || email.length > 254
    || at <= 0
    || at === email.length - 1
    || email.indexOf('@') !== at
    || /\s/.test(email)
  ) throw new Error('invalid_plan_confirmation_email')
  return email
}

function normalizeManageUrl(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value !== 'string') throw new Error('invalid_plan_manage_url')
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error('invalid_plan_manage_url')
  }
  if (!['https:', 'http:'].includes(url.protocol)) throw new Error('invalid_plan_manage_url')
  return url.toString()
}

function requiredSingleLine(value: unknown, field: string, maximumLength: number): string {
  if (typeof value !== 'string') throw new Error(`invalid_${field}`)
  const normalized = value.trim()
  if (!normalized || normalized.length > maximumLength || /[\u0000-\u001f\u007f]/.test(normalized)) {
    throw new Error(`invalid_${field}`)
  }
  return normalized
}

function normalizeDeliveryError(value: unknown): string {
  const message = value instanceof Error ? value.message : String(value ?? '')
  return message.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, 2_000)
    || 'confirmation_delivery_failed'
}
