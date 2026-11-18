/**
 * Belvo webhooks.
 *
 * Belvo does NOT sign webhooks with an HMAC scheme. Authenticity is instead
 * established by an OPTIONAL HTTP credential the merchant configures when
 * registering the webhook URL: Belvo replays it on every delivery as an
 * `Authorization` header (a `Basic base64(user:pass)` or `Bearer <token>`
 * string the merchant chose). We verify by constant-time comparing that
 * replayed header against the stored secret. When no secret was configured
 * the merchant opted out and we cannot assert authenticity.
 *
 * Payload envelope (aggregation):
 *   { webhook_id, webhook_type, process_type, webhook_code, link_id,
 *     request_id, external_id, data }
 *
 * Docs: https://developers.belvo.com/developer_resources/resources-webhooks-aggregation
 */
import { timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type {
  WebhookEvent,
  WebhookResourceType,
  WebhookAction,
} from '../../schema/webhook'

/** Belvo `webhook_type` → canonical resource. Only the types that map onto a
 *  payments resource are listed; everything else falls through to unknown. */
const RESOURCE_MAP: Record<string, WebhookResourceType> = {
  transactions: 'charges',
  owners: 'customers',
}

/** Belvo `webhook_code` → canonical action. Data-availability codes are
 *  treated as create/update events; consent/credential failures as failures. */
const ACTION_MAP: Record<string, WebhookAction> = {
  historical_update: 'created',
  new_transactions_available: 'created',
  new_accounts_available: 'created',
  new_invoices_available: 'created',
  transactions_updated: 'updated',
  invalid_credentials: 'failed',
  token_required: 'failed',
  consent_rejected: 'failed',
  link_deleted: 'deleted',
}

function classify(
  webhookType: string,
  webhookCode: string,
): { resourceType: WebhookResourceType; action: WebhookAction } {
  return {
    resourceType: RESOURCE_MAP[webhookType.toLowerCase()] ?? 'unknown',
    action: ACTION_MAP[webhookCode.toLowerCase()] ?? 'unknown',
  }
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8')
  const bufB = Buffer.from(b, 'utf8')
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

/**
 * Verify a Belvo webhook by matching the replayed `Authorization` header
 * against the secret the merchant registered. `payload` is unused — Belvo
 * carries no body signature — but kept for the `BaseAdapter.verifyWebhook`
 * contract.
 */
export function verifyBelvoWebhook(
  _payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  if (!secret) return false
  const auth = headers['authorization'] ?? headers['Authorization']
  if (!auth) return false
  return safeEqual(auth, secret)
}

export function parseBelvoWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const webhookType = String(payload['webhook_type'] ?? '')
  const webhookCode = String(payload['webhook_code'] ?? '')
  const linkId = String(payload['link_id'] ?? '')
  const eventId = payload['webhook_id'] ? String(payload['webhook_id']) : undefined
  const { resourceType, action } = classify(webhookType, webhookCode)
  return [
    {
      id: eventId,
      platform: 'belvo',
      type: `${webhookType.toLowerCase()}.${webhookCode.toLowerCase()}`,
      resourceType,
      action,
      resourceId: linkId,
      payload,
    },
  ]
}

export const BelvoWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyBelvoWebhook,
  parseWebhookEvents: parseBelvoWebhookEvents,
}
