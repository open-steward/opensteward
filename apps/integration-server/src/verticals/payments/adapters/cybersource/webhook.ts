/**
 * Cybersource Webhooks Service (REST notifications) signs with HMAC-SHA-256
 * over the raw body. The signature header is `signature-cybersource` in
 * the new webhook product; legacy customers receive notifications without
 * signatures. v1 of the adapter does both.
 *
 * Docs: https://developer.cybersource.com/api-reference-assets/webhooks/
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type {
  WebhookEvent,
  WebhookResourceType,
  WebhookAction,
} from '../../schema/webhook'

const RESOURCE_MAP: Record<string, WebhookResourceType> = {
  payments: 'charges',
  refunds: 'refunds',
  payment: 'charges',
  refund: 'refunds',
  reports: 'balance_transactions',
}

const ACTION_MAP: Record<string, WebhookAction> = {
  created: 'created',
  authorized: 'created',
  captured: 'paid',
  refunded: 'refunded',
  voided: 'voided',
  failed: 'failed',
}

function classify(eventType: string): { resourceType: WebhookResourceType; action: WebhookAction } {
  const parts = eventType.toLowerCase().split('.')
  const head = parts[0] ?? ''
  const verb = parts[parts.length - 1] ?? ''
  return {
    resourceType: RESOURCE_MAP[head] ?? 'unknown',
    action: ACTION_MAP[verb] ?? 'unknown',
  }
}

export function verifyCybersourceWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const sig = headers['signature-cybersource'] ?? headers['Signature-Cybersource']
    if (!sig) return true // legacy notifications are unsigned; accept structurally
    const expected = createHmac('sha256', secret).update(payload).digest('base64')
    const a = Buffer.from(sig)
    const b = Buffer.from(expected)
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

export function parseCybersourceWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const eventType = String(payload['eventType'] ?? payload['type'] ?? '')
  const id = String(payload['eventId'] ?? payload['id'] ?? '')
  const data = (payload['payload'] as Record<string, unknown> | undefined) ?? {}
  const resourceId = String(data['id'] ?? '')
  const { resourceType, action } = classify(eventType)
  return [
    {
      id: id || undefined,
      platform: 'cybersource',
      type: eventType,
      resourceType,
      action,
      resourceId,
      payload,
    },
  ]
}

export const CybersourceWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyCybersourceWebhook,
  parseWebhookEvents: parseCybersourceWebhookEvents,
}
