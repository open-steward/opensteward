/**
 * Worldpay Access webhook notifications carry an HMAC-SHA-256 signature in
 * the `Worldpay-Webhook-Signature` header — comma-separated, with the
 * `v1=…` part being the hex signature over the raw body using the webhook
 * secret.
 *
 * Docs: https://docs.worldpay.com/access/products/events/openapi
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type {
  WebhookEvent,
  WebhookResourceType,
  WebhookAction,
} from '../../schema/webhook'

function parseV1(header: string): string | null {
  for (const part of header.split(',')) {
    const [k, v] = part.split('=')
    if (k?.trim() === 'v1' && v) return v.trim()
  }
  return null
}

const RESOURCE_MAP: Record<string, WebhookResourceType> = {
  payment: 'charges',
  refund: 'refunds',
  dispute: 'disputes',
  payout: 'payouts',
}

const ACTION_MAP: Record<string, WebhookAction> = {
  authorized: 'created',
  settled: 'paid',
  refunded: 'refunded',
  voided: 'voided',
  failed: 'failed',
}

function classify(type: string): { resourceType: WebhookResourceType; action: WebhookAction } {
  const parts = type.toLowerCase().split('.')
  const head = parts[0] ?? ''
  const verb = parts[parts.length - 1] ?? ''
  return {
    resourceType: RESOURCE_MAP[head] ?? 'unknown',
    action: ACTION_MAP[verb] ?? 'unknown',
  }
}

export function verifyWorldpayWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const header = headers['worldpay-webhook-signature'] ?? headers['Worldpay-Webhook-Signature']
    if (!header) return false
    const sig = parseV1(header)
    if (!sig) return false
    const expected = createHmac('sha256', secret).update(payload).digest('hex')
    const a = Buffer.from(sig, 'hex')
    const b = Buffer.from(expected, 'hex')
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

export function parseWorldpayWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const eventType = String(payload['eventType'] ?? payload['type'] ?? '')
  const id = String(payload['eventId'] ?? payload['id'] ?? '')
  const eventDetails = (payload['eventDetails'] as Record<string, unknown> | undefined) ?? {}
  const resourceId = String(eventDetails['paymentId'] ?? eventDetails['refundId'] ?? '')
  const { resourceType, action } = classify(eventType)
  return [
    {
      id: id || undefined,
      platform: 'worldpay-fis',
      type: eventType,
      resourceType,
      action,
      resourceId,
      payload,
    },
  ]
}

export const WorldpayFisWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyWorldpayWebhook,
  parseWebhookEvents: parseWorldpayWebhookEvents,
}
