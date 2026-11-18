/**
 * Dodo Payments webhook verification + event parsing.
 *
 * Dodo follows the Standard Webhooks spec (https://www.standardwebhooks.com).
 * Three headers ride along: `webhook-id`, `webhook-timestamp` (unix seconds),
 * and `webhook-signature`. The signed content is `${id}.${timestamp}.${body}`;
 * the signature is an HMAC-SHA256 over that string, base64-encoded. The
 * signing secret is delivered as `whsec_<base64>`; the bytes after the prefix
 * are the base64-decoded HMAC key. The `webhook-signature` header is a
 * space-separated list of `v1,<base64sig>` entries (one per active secret).
 *
 * Event payloads look like:
 *   { business_id, type: "payment.succeeded", timestamp,
 *     data: { payload_type: "Payment", payment_id, ... } }
 *
 * Docs: https://docs.dodopayments.com/developer-resources/webhooks
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type {
  WebhookEvent,
  WebhookResourceType,
  WebhookAction,
} from '../../schema/webhook'

const TOLERANCE_SECONDS = 5 * 60

/** payload_type values → canonical resource types. */
const RESOURCE_MAP: Record<string, WebhookResourceType> = {
  payment: 'charges',
  subscription: 'subscriptions',
  refund: 'refunds',
  dispute: 'disputes',
  customer: 'customers',
  product: 'products',
}

/** Dodo event verbs → canonical actions. */
const ACTION_MAP: Record<string, WebhookAction> = {
  succeeded: 'succeeded',
  failed: 'failed',
  cancelled: 'cancelled',
  processing: 'updated',
  active: 'updated',
  on_hold: 'updated',
  renewed: 'paid',
  plan_changed: 'updated',
  paid: 'paid',
  expired: 'cancelled',
  created: 'created',
  updated: 'updated',
  accepted: 'disputed',
  opened: 'disputed',
  challenged: 'disputed',
  won: 'updated',
  lost: 'updated',
  reversed: 'updated',
}

function classify(type: string): { resourceType: WebhookResourceType; action: WebhookAction } {
  const lowered = type.toLowerCase()
  const dot = lowered.indexOf('.')
  if (dot === -1) return { resourceType: 'unknown', action: 'unknown' }
  const head = lowered.slice(0, dot)
  const verb = lowered.slice(dot + 1).replace(/\./g, '_')
  return {
    resourceType: RESOURCE_MAP[head] ?? 'unknown',
    action: ACTION_MAP[verb] ?? 'unknown',
  }
}

function secretKeyBytes(secret: string): Buffer {
  const base64 = secret.startsWith('whsec_') ? secret.slice('whsec_'.length) : secret
  return Buffer.from(base64, 'base64')
}

export function verifyDodoPaymentsWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const id = headers['webhook-id'] ?? headers['Webhook-Id']
    const timestamp = headers['webhook-timestamp'] ?? headers['Webhook-Timestamp']
    const sigHeader = headers['webhook-signature'] ?? headers['Webhook-Signature']
    if (!id || !timestamp || !sigHeader) return false

    const ts = parseInt(timestamp, 10)
    if (!Number.isFinite(ts)) return false
    const now = Math.floor(Date.now() / 1000)
    if (Math.abs(now - ts) > TOLERANCE_SECONDS) return false

    const signed = `${id}.${timestamp}.${payload.toString('utf8')}`
    const expected = createHmac('sha256', secretKeyBytes(secret)).update(signed).digest('base64')
    const expectedBuf = Buffer.from(expected, 'base64')

    // Header is a space-separated list of `v1,<base64sig>` entries.
    return sigHeader.split(' ').some((entry) => {
      const comma = entry.indexOf(',')
      const sig = comma === -1 ? entry : entry.slice(comma + 1)
      const sigBuf = Buffer.from(sig, 'base64')
      if (sigBuf.length !== expectedBuf.length || sigBuf.length === 0) return false
      return timingSafeEqual(sigBuf, expectedBuf)
    })
  } catch {
    return false
  }
}

export function parseDodoPaymentsWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const type = String(payload['type'] ?? '')
  const data = (payload['data'] as Record<string, unknown> | undefined) ?? {}
  const resourceId = String(
    data['payment_id'] ??
      data['subscription_id'] ??
      data['refund_id'] ??
      data['dispute_id'] ??
      data['customer_id'] ??
      data['product_id'] ??
      '',
  )
  const { resourceType, action } = classify(type)
  return [
    {
      platform: 'dodo-payments',
      type,
      resourceType,
      action,
      resourceId,
      payload,
    },
  ]
}

export const DodoPaymentsWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyDodoPaymentsWebhook,
  parseWebhookEvents: parseDodoPaymentsWebhookEvents,
}
