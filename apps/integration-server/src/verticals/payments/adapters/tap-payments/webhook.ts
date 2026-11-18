/**
 * Tap Payments webhook verification.
 *
 * Tap signs each webhook with an HMAC-SHA256 over a deterministic
 * concatenation of selected fields, keyed by the merchant's secret API key
 * (the same `sk_live_…` / `sk_test_…` used for REST auth). The hex digest is
 * delivered in the `hashstring` header.
 *
 * For charges / authorizes / refunds the hashed string is:
 *   x_id{id}x_amount{amount}x_currency{currency}
 *   x_gateway_reference{gateway_ref}x_payment_reference{payment_ref}
 *   x_status{status}x_created{created}
 *
 * `amount` must be formatted to the currency's ISO 4217 minor-unit decimal
 * count (e.g. 2 for AED, 3 for KWD) before hashing.
 *
 * Docs: https://developers.tap.company/docs/webhook
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type {
  WebhookEvent,
  WebhookResourceType,
  WebhookAction,
} from '../../schema/webhook'

const THREE_DECIMAL_CURRENCIES = new Set(['BHD', 'KWD', 'OMR', 'TND', 'IQD', 'JOD', 'LYD'])
const ZERO_DECIMAL_CURRENCIES = new Set(['JPY', 'KRW', 'CLP', 'VND', 'XOF', 'XAF', 'DJF'])

function currencyDecimals(currency: string): number {
  const c = currency.toUpperCase()
  if (THREE_DECIMAL_CURRENCIES.has(c)) return 3
  if (ZERO_DECIMAL_CURRENCIES.has(c)) return 0
  return 2
}

function formatAmount(amount: unknown, currency: string): string {
  const n = typeof amount === 'number' ? amount : Number(amount)
  if (!Number.isFinite(n)) return String(amount ?? '')
  return n.toFixed(currencyDecimals(currency))
}

/** The `object` field on a Tap payload maps to a canonical resource type. */
const RESOURCE_MAP: Record<string, WebhookResourceType> = {
  charge: 'charges',
  authorize: 'charges',
  refund: 'refunds',
  invoice: 'invoices',
  customer: 'customers',
}

/** Tap object statuses map onto canonical webhook actions. */
const ACTION_MAP: Record<string, WebhookAction> = {
  CAPTURED: 'succeeded',
  REFUNDED: 'refunded',
  FAILED: 'failed',
  DECLINED: 'failed',
  TIMEDOUT: 'failed',
  RESTRICTED: 'failed',
  CANCELLED: 'cancelled',
  VOID: 'voided',
  ABANDONED: 'cancelled',
  INITIATED: 'created',
  PENDING: 'created',
  PAID: 'paid',
}

function classify(
  object: string,
  status: string,
): { resourceType: WebhookResourceType; action: WebhookAction } {
  return {
    resourceType: RESOURCE_MAP[object.toLowerCase()] ?? 'unknown',
    action: ACTION_MAP[status.toUpperCase()] ?? 'unknown',
  }
}

/**
 * Build the field-concatenated hashstring Tap signs. Returns undefined when
 * the payload can't be parsed (so the caller fails the verification cleanly).
 */
function buildToBeHashed(payload: Buffer): string | undefined {
  try {
    const body = JSON.parse(payload.toString('utf8')) as Record<string, unknown>
    const currency = String(body['currency'] ?? '')
    const reference = (body['reference'] as Record<string, unknown> | undefined) ?? {}
    const id = String(body['id'] ?? '')
    const amount = formatAmount(body['amount'], currency)
    const gatewayRef = String(reference['gateway'] ?? '')
    const paymentRef = String(reference['payment'] ?? '')
    const status = String(body['status'] ?? '')
    const created = String(body['created'] ?? '')
    return (
      `x_id${id}` +
      `x_amount${amount}` +
      `x_currency${currency}` +
      `x_gateway_reference${gatewayRef}` +
      `x_payment_reference${paymentRef}` +
      `x_status${status}` +
      `x_created${created}`
    )
  } catch {
    return undefined
  }
}

export function verifyTapPaymentsWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const sig = headers['hashstring'] ?? headers['Hashstring'] ?? headers['HASHSTRING']
    if (!sig) return false
    const toBeHashed = buildToBeHashed(payload)
    if (toBeHashed === undefined) return false
    const expected = createHmac('sha256', secret).update(toBeHashed).digest('hex')
    const a = Buffer.from(sig, 'hex')
    const b = Buffer.from(expected, 'hex')
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

export function parseTapPaymentsWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const object = String(payload['object'] ?? '')
  const status = String(payload['status'] ?? '')
  const resourceId = String(payload['id'] ?? '')
  const { resourceType, action } = classify(object, status)
  return [
    {
      platform: 'tap-payments',
      type: `${object || 'event'}.${status.toLowerCase() || 'unknown'}`,
      resourceType,
      action,
      resourceId,
      payload,
    },
  ]
}

export const TapPaymentsWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyTapPaymentsWebhook,
  parseWebhookEvents: parseTapPaymentsWebhookEvents,
}
