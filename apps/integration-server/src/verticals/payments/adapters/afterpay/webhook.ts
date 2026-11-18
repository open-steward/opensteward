/**
 * Afterpay webhooks ship with a `Signature` header — HMAC-SHA-256 of the
 * raw body using the shared secret, hex-encoded.
 *
 * Docs: https://developers.afterpay.com/afterpay-online/reference/webhook-introduction
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type {
  WebhookEvent,
  WebhookResourceType,
  WebhookAction,
} from '../../schema/webhook'

const RESOURCE_MAP: Record<string, WebhookResourceType> = {
  payment: 'charges',
  refund: 'refunds',
  order: 'charges',
}

const ACTION_MAP: Record<string, WebhookAction> = {
  authorized: 'created',
  captured: 'paid',
  declined: 'failed',
  voided: 'voided',
  refunded: 'refunded',
}

function classify(type: string): { resourceType: WebhookResourceType; action: WebhookAction } {
  const parts = type.toLowerCase().split('.')
  const head = parts[0] ?? ''
  const verb = parts.slice(1).join('.') || head
  return {
    resourceType: RESOURCE_MAP[head] ?? 'unknown',
    action: ACTION_MAP[verb] ?? 'unknown',
  }
}

export function verifyAfterpayWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const sig = headers['signature'] ?? headers['Signature']
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

export function parseAfterpayWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const eventType = String(payload['eventType'] ?? payload['type'] ?? '')
  const id = String(payload['eventId'] ?? payload['id'] ?? '')
  const resourceId = String(payload['orderId'] ?? payload['refundId'] ?? '')
  const { resourceType, action } = classify(eventType)
  return [
    {
      id: id || undefined,
      platform: 'afterpay',
      type: eventType,
      resourceType,
      action,
      resourceId,
      payload,
    },
  ]
}

export const AfterpayWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyAfterpayWebhook,
  parseWebhookEvents: parseAfterpayWebhookEvents,
}
