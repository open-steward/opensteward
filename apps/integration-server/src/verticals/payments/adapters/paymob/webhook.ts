/**
 * Paymob transaction callback (webhook).
 *
 * When a transaction's state changes Paymob POSTs a JSON callback shaped as
 * `{ type: "TRANSACTION", obj: { …transaction… } }` and appends an `hmac`
 * query parameter to the callback URL. Unlike a raw-body HMAC, Paymob computes
 * the signature over a FIXED, lexicographically-ordered subset of the `obj`
 * fields concatenated as strings, keyed by the merchant's HMAC secret
 * (dashboard → Settings → Account Info → HMAC), using HMAC-SHA512 (hex).
 *
 * Concatenation order (the canonical Paymob list):
 *   amount_cents, created_at, currency, error_occured, has_parent_transaction,
 *   id, integration_id, is_3d_secure, is_auth, is_capture, is_refunded,
 *   is_standalone_payment, is_voided, order.id, owner, pending,
 *   source_data.pan, source_data.sub_type, source_data.type, success
 *
 * To fit the `verifyWebhook(payload, headers, secret)` seam, `payload` is the
 * raw request body (we read the signed `obj` fields from it) and `headers`
 * carries the `hmac` value (the router lifts the `hmac` query parameter into
 * the headers map). `secret` is the merchant HMAC key.
 *
 * Docs: https://developers.paymob.com/paymob-docs/developers/webhook-callbacks-and-hmac
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type {
  WebhookEvent,
  WebhookResourceType,
  WebhookAction,
} from '../../schema/webhook'

/** Paymob callback `type` → canonical resource. */
const RESOURCE_MAP: Record<string, WebhookResourceType> = {
  transaction: 'charges',
  token: 'payment_methods',
  delivery_status: 'charges',
}

/** Boolean-flag inspection on the transaction `obj` → canonical action. */
function classifyAction(obj: Record<string, unknown>): WebhookAction {
  const flag = (k: string): boolean => {
    const v = obj[k]
    if (typeof v === 'boolean') return v
    if (typeof v === 'string') return v.toLowerCase() === 'true'
    return false
  }
  if (flag('is_voided')) return 'cancelled'
  if (flag('is_refunded')) return 'refunded'
  if (flag('error_occured')) return 'failed'
  if (flag('pending')) return 'created'
  if (flag('success')) return 'paid'
  return 'unknown'
}

/** Fields concatenated (in this exact order) before hashing. */
const HMAC_FIELDS = [
  'amount_cents',
  'created_at',
  'currency',
  'error_occured',
  'has_parent_transaction',
  'id',
  'integration_id',
  'is_3d_secure',
  'is_auth',
  'is_capture',
  'is_refunded',
  'is_standalone_payment',
  'is_voided',
  'order.id',
  'owner',
  'pending',
  'source_data.pan',
  'source_data.sub_type',
  'source_data.type',
  'success',
] as const

/** Resolve a dotted path (e.g. `order.id`) and stringify; missing → ''. */
function resolve(obj: Record<string, unknown>, path: string): string {
  const segments = path.split('.')
  let cur: unknown = obj
  for (const seg of segments) {
    if (cur && typeof cur === 'object' && seg in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[seg]
    } else {
      return ''
    }
  }
  return cur == null ? '' : String(cur)
}

function concatHmacFields(obj: Record<string, unknown>): string {
  return HMAC_FIELDS.map((f) => resolve(obj, f)).join('')
}

/**
 * Recompute the Paymob callback HMAC from the `obj` fields and compare it
 * (constant-time) against the supplied value.
 */
export function verifyPaymobWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    if (!secret) return false
    const provided = headers['hmac'] ?? headers['Hmac'] ?? headers['HMAC']
    if (!provided) return false

    const body = JSON.parse(payload.toString('utf8')) as Record<string, unknown>
    const obj = (body['obj'] as Record<string, unknown> | undefined) ?? body
    const concatenated = concatHmacFields(obj)
    const expected = createHmac('sha512', secret).update(concatenated, 'utf8').digest('hex')

    const a = Buffer.from(provided.toLowerCase(), 'utf8')
    const b = Buffer.from(expected, 'utf8')
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

export function parsePaymobWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const type = String(payload['type'] ?? '').toLowerCase()
  const obj = (payload['obj'] as Record<string, unknown> | undefined) ?? {}
  const resourceType: WebhookResourceType = RESOURCE_MAP[type] ?? 'unknown'
  const action: WebhookAction = type === 'transaction' ? classifyAction(obj) : 'unknown'
  const order = obj['order'] as Record<string, unknown> | undefined
  const resourceId = String(obj['id'] ?? order?.['id'] ?? '')
  return [
    {
      id: obj['id'] != null ? String(obj['id']) : undefined,
      platform: 'paymob',
      type: type || 'transaction',
      resourceType,
      action,
      resourceId,
      payload,
    },
  ]
}

export const PaymobWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyPaymobWebhook,
  parseWebhookEvents: parsePaymobWebhookEvents,
}
