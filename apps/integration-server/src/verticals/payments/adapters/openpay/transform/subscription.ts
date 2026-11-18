/**
 * Openpay subscription → canonical Subscription.
 *
 * Subscriptions are customer-scoped:
 *   GET /v1/{MERCHANT_ID}/customers/{CUSTOMER_ID}/subscriptions
 *   GET /v1/{MERCHANT_ID}/customers/{CUSTOMER_ID}/subscriptions/{SUBSCRIPTION_ID}
 *
 * Fields from "Objeto Suscripción" (https://documents.openpay.mx/docs/api/index.html):
 * id, creation_date ("Fecha y hora en que se creó la suscripción en formato
 * ISO 8601"), cancel_at_period_end ("Indica si se cancela la suscripción al
 * terminar el periodo."), charge_date, current_period_number, period_end_date,
 * trial_end_date, plan_id ("Identificador del plan sobre el que se crea la
 * suscripción."), status, customer_id, card.
 *
 * status: "Estado de la suscripción puede ser "active", "trial", "past_due",
 * "unpaid", o "cancelled"". "unpaid" is set "cuando se agotan los intentos de
 * cobro", the same state the reference Stripe transform maps to 'expired'.
 * Anything else is 'unknown'; the raw value is kept in metadata.status.
 *
 * The object documents no currency and no amount, so neither is mapped.
 * charge_date, period_end_date and trial_end_date are calendar dates with no
 * time or zone ("2014-01-12"), so they are carried verbatim in metadata rather
 * than turned into UTC instants.
 *
 * The canonical id is "customerId:subscriptionId", the form getSubscription
 * and cancelSubscription take, so a listed id can be read back.
 */
import { toIsoDatetime } from '@opensteward/shared'
import type { Subscription, SubscriptionStatus } from '../../../schema/subscription'
import { optString, requireId } from './shared'

export interface RawOpenpaySubscription {
  id?: string
  status?: string
  creation_date?: string
  cancel_at_period_end?: boolean | string
  charge_date?: string
  current_period_number?: number | string
  period_end_date?: string
  trial_end_date?: string
  plan_id?: string
  customer_id?: string
  card?: { id?: string; [k: string]: unknown } | null
  [k: string]: unknown
}

function mapStatus(s: unknown): SubscriptionStatus {
  switch (s) {
    case 'active':
      return 'active'
    case 'trial':
      return 'trialing'
    case 'past_due':
      return 'past_due'
    case 'unpaid':
      return 'expired'
    case 'cancelled':
      return 'cancelled'
    default:
      return 'unknown'
  }
}

function cancelAtPeriodEnd(v: unknown): boolean | undefined {
  // Typed "string" in the property table, a boolean in the example object.
  if (v === true || v === 'true') return true
  if (v === false || v === 'false') return false
  return undefined
}

export function transformSubscription(
  raw: RawOpenpaySubscription,
  customerId: string,
): Subscription {
  const subId = requireId(raw, 'subscription')
  const planId = optString(raw.plan_id)
  const cardId = raw.card ? optString(raw.card.id) : undefined

  const metadata: Record<string, string> = {}
  const status = optString(raw.status)
  if (status) metadata['status'] = status
  for (const k of ['charge_date', 'period_end_date', 'trial_end_date'] as const) {
    const v = optString(raw[k])
    if (v) metadata[k] = v
  }
  const period = raw.current_period_number
  if (typeof period === 'number' || (typeof period === 'string' && period !== '')) {
    metadata['current_period_number'] = String(period)
  }

  return {
    id: `${customerId}:${subId}`,
    externalId: subId,
    customerId,
    status: mapStatus(raw.status),
    items: planId ? [{ id: `${subId}:${planId}`, priceId: planId }] : [],
    cancelAtPeriodEnd: cancelAtPeriodEnd(raw.cancel_at_period_end),
    defaultPaymentMethodId: cardId ? `${customerId}:${cardId}` : undefined,
    gateway: 'openpay',
    metadata,
    createdAt: toIsoDatetime(raw.creation_date),
    raw,
  }
}
