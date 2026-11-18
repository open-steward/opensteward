/**
 * Paystack signs webhooks with HMAC-SHA-512 of the raw body using the
 * merchant's secret key (the same `sk_live_…` or `sk_test_…` used for API
 * auth). The signature ships hex-encoded in `x-paystack-signature`.
 *
 * Docs: https://paystack.com/docs/payments/webhooks
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type {
  WebhookEvent,
  WebhookResourceType,
  WebhookAction,
} from '../../schema/webhook'

const RESOURCE_MAP: Record<string, WebhookResourceType> = {
  charge: 'charges',
  transfer: 'payouts',
  subscription: 'subscriptions',
  invoice: 'invoices',
  customeridentification: 'customers',
  customer: 'customers',
  dvain: 'charges',
  paymentrequest: 'invoices',
}

const ACTION_MAP: Record<string, WebhookAction> = {
  success: 'paid',
  failed: 'failed',
  create: 'created',
  reversed: 'cancelled',
  disable: 'cancelled',
  enable: 'updated',
  notpaid: 'failed',
  payment_failed: 'failed',
  pending: 'created',
}

function classify(eventType: string): { resourceType: WebhookResourceType; action: WebhookAction } {
  const lowered = eventType.toLowerCase()
  const dot = lowered.indexOf('.')
  if (dot === -1) return { resourceType: 'unknown', action: 'unknown' }
  const head = lowered.slice(0, dot).replace(/[._]/g, '')
  const verb = lowered.slice(dot + 1).replace(/\./g, '_')
  return {
    resourceType: RESOURCE_MAP[head] ?? 'unknown',
    action: ACTION_MAP[verb] ?? 'unknown',
  }
}

export function verifyPaystackWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const sig = headers['x-paystack-signature'] ?? headers['X-Paystack-Signature']
    if (!sig) return false
    const expected = createHmac('sha512', secret).update(payload).digest('hex')
    const a = Buffer.from(sig, 'hex')
    const b = Buffer.from(expected, 'hex')
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

export function parsePaystackWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const eventType = String(payload['event'] ?? '')
  const data = (payload['data'] as Record<string, unknown> | undefined) ?? {}
  const resourceId = String(data['id'] ?? data['reference'] ?? data['transfer_code'] ?? '')
  const { resourceType, action } = classify(eventType)
  return [
    {
      platform: 'paystack',
      type: eventType,
      resourceType,
      action,
      resourceId,
      payload,
    },
  ]
}

export const PaystackWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyPaystackWebhook,
  parseWebhookEvents: parsePaystackWebhookEvents,
}
