/**
 * Easebuzz transaction webhook.
 *
 * Easebuzz POSTs the full transaction object (same field names as the
 * `/transaction/v2/retrieve` response) to the merchant's configured URL on
 * every status update. Authenticity is proven by a `hash` field carrying the
 * "reverse hash": the lowercase SHA-512 of
 *
 *   salt|status|udf10|udf9|…|udf1|email|firstname|productinfo|amount|txnid|key
 *
 * i.e. the salt first, then the initiate-payment sequence reversed. This is
 * the same scheme the hosted-checkout success/failure callback uses.
 *
 * Docs: https://docs.easebuzz.in/docs/payment-gateway (Transaction Webhook)
 */
import { createHash, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type {
  WebhookEvent,
  WebhookResourceType,
  WebhookAction,
} from '../../schema/webhook'

/** Fields after `salt|status`, in reverse order, that feed the response hash. */
const REVERSE_FIELDS = [
  'udf10',
  'udf9',
  'udf8',
  'udf7',
  'udf6',
  'udf5',
  'udf4',
  'udf3',
  'udf2',
  'udf1',
  'email',
  'firstname',
  'productinfo',
  'amount',
  'txnid',
  'key',
] as const

/** Map an Easebuzz transaction status string to a canonical webhook action. */
function statusToAction(status: string): WebhookAction {
  switch (status.toLowerCase()) {
    case 'success':
    case 'completed':
      return 'paid'
    case 'failure':
    case 'failed':
    case 'bounced':
      return 'failed'
    case 'usercancelled':
    case 'user_cancelled':
      return 'cancelled'
    case 'refunded':
      return 'refunded'
    case 'pending':
    case 'initiated':
      return 'created'
    default:
      return 'unknown'
  }
}

/**
 * Build the expected reverse hash from the parsed webhook fields + salt.
 * Empty/absent fields contribute an empty segment, matching Easebuzz.
 */
function computeReverseHash(fields: Record<string, string>, salt: string): string {
  let hashString = `${salt}|${fields['status'] ?? ''}`
  for (const field of REVERSE_FIELDS) {
    hashString += `|${fields[field] ?? ''}`
  }
  return createHash('sha512').update(hashString).digest('hex').toLowerCase()
}

/** Decode a form-encoded or JSON webhook body into a flat string map. */
function parseBody(payload: Buffer): Record<string, string> {
  const text = payload.toString('utf8').trim()
  if (!text) return {}
  if (text.startsWith('{')) {
    try {
      const obj = JSON.parse(text) as Record<string, unknown>
      const out: Record<string, string> = {}
      for (const [k, v] of Object.entries(obj)) out[k] = v == null ? '' : String(v)
      return out
    } catch {
      return {}
    }
  }
  const out: Record<string, string> = {}
  for (const [k, v] of new URLSearchParams(text)) out[k] = v
  return out
}

export function verifyEasebuzzWebhook(
  payload: Buffer,
  _headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const fields = parseBody(payload)
    const provided = fields['hash']
    if (!provided) return false
    const expected = computeReverseHash(fields, secret)
    const a = Buffer.from(provided.toLowerCase(), 'utf8')
    const b = Buffer.from(expected, 'utf8')
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

export function parseEasebuzzWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const status = String(payload['status'] ?? '')
  const action = statusToAction(status)
  const resourceId = String(payload['easepayid'] ?? payload['txnid'] ?? '')
  const resourceType: WebhookResourceType = 'charges'
  return [
    {
      platform: 'easebuzz',
      type: `transaction.${status || 'unknown'}`,
      resourceType,
      action,
      resourceId,
      payload,
    },
  ]
}

export const EasebuzzWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyEasebuzzWebhook,
  parseWebhookEvents: parseEasebuzzWebhookEvents,
}
