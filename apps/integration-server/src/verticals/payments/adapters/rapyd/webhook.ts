/**
 * Rapyd webhook verification + parsing.
 *
 * Rapyd signs every webhook the same way it signs API requests, but over the
 * webhook's own destination URL:
 *
 *   to_sign   = url_path + salt + timestamp + access_key + secret_key + body
 *   signature = BASE64( HEX( HMAC-SHA256( to_sign, key = secret_key ) ) )
 *
 * where `url_path` is the FULL webhook destination URL exactly as registered in
 * the Client Portal (e.g. `https://hooks.example.com/rapyd`). Rapyd sends the
 * `salt`, `timestamp`, `access_key`, and `signature` as request headers; the
 * body must be hashed exactly as received (no whitespace re-formatting).
 *
 * The `verifyWebhook(payload, headers, secret)` contract gives us the raw body,
 * the headers (carrying `access_key`/`salt`/`timestamp`/`signature`), and the
 * organization secret key as `secret`. The one value not on the wire is the
 * registered destination URL — Rapyd folds it into the HMAC. We read it from
 * `RAPYD_WEBHOOK_URL` so deployments that set it get full verification; when it
 * is absent verification fails closed (returns false) rather than silently
 * accepting unverified payloads.
 *
 * Docs: https://docs.rapyd.net/en/webhook-authentication.html
 *       https://docs.rapyd.net/en/webhook-format.html
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type {
  WebhookEvent,
  WebhookResourceType,
  WebhookAction,
} from '../../schema/webhook'

/**
 * Rapyd event names are upper-snake: `PAYMENT_COMPLETED`, `REFUND_COMPLETED`,
 * `PAYOUT_CREATED`, `CUSTOMER_CREATED`, … The first token is the resource and
 * the remaining tokens are the verb.
 */
const RESOURCE_MAP: Record<string, WebhookResourceType> = {
  payment: 'charges',
  refund: 'refunds',
  payout: 'payouts',
  customer: 'customers',
  subscription: 'subscriptions',
  invoice: 'invoices',
  dispute: 'disputes',
}

const ACTION_MAP: Record<string, WebhookAction> = {
  completed: 'succeeded',
  succeeded: 'succeeded',
  created: 'created',
  updated: 'updated',
  failed: 'failed',
  expired: 'cancelled',
  canceled: 'cancelled',
  cancelled: 'cancelled',
  refunded: 'refunded',
  rejected: 'failed',
}

function classify(eventType: string): { resourceType: WebhookResourceType; action: WebhookAction } {
  const tokens = eventType.toLowerCase().split('_').filter(Boolean)
  const head = tokens[0] ?? ''
  const verb = tokens[tokens.length - 1] ?? ''
  return {
    resourceType: RESOURCE_MAP[head] ?? 'unknown',
    action: ACTION_MAP[verb] ?? 'unknown',
  }
}

export function verifyRapydWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const sig = headers['signature'] ?? headers['Signature']
    const salt = headers['salt'] ?? headers['Salt']
    const timestamp = headers['timestamp'] ?? headers['Timestamp']
    const accessKey = headers['access_key'] ?? headers['Access_key'] ?? headers['Access-Key']
    const urlPath = process.env['RAPYD_WEBHOOK_URL']
    if (!sig || !salt || !timestamp || !accessKey || !urlPath) return false

    const toSign = urlPath + salt + timestamp + accessKey + secret + payload.toString('utf8')
    const digestHex = createHmac('sha256', secret).update(toSign).digest('hex')
    const expected = Buffer.from(digestHex).toString('base64')

    const a = Buffer.from(sig, 'utf8')
    const b = Buffer.from(expected, 'utf8')
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

export function parseRapydWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const eventType = String(payload['type'] ?? '')
  const data = (payload['data'] as Record<string, unknown> | undefined) ?? {}
  const resourceId = String(data['id'] ?? data['token'] ?? '')
  const webhookId = payload['id'] != null ? String(payload['id']) : undefined
  const { resourceType, action } = classify(eventType)
  return [
    {
      id: webhookId,
      platform: 'rapyd',
      type: eventType,
      resourceType,
      action,
      resourceId,
      payload,
    },
  ]
}

export const RapydWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyRapydWebhook,
  parseWebhookEvents: parseRapydWebhookEvents,
}
