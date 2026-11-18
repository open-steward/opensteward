/**
 * Checkout.com signs webhooks with HMAC-SHA-256 over the raw body. The
 * signature ships in the `cko-signature` header (hex-encoded).
 *
 * Docs: https://www.checkout.com/docs/developer-resources/webhooks/signature
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
  dispute: 'disputes',
  payout: 'payouts',
}

const ACTION_MAP: Record<string, WebhookAction> = {
  captured: 'paid',
  authorized: 'created',
  declined: 'failed',
  voided: 'voided',
  pending: 'created',
  refunded: 'refunded',
  returned: 'failed',
  paid: 'paid',
  evidence_required: 'updated',
  resolved: 'updated',
  won: 'updated',
  lost: 'updated',
  accepted: 'updated',
}

function classify(eventType: string): {
  resourceType: WebhookResourceType
  action: WebhookAction
} {
  const parts = eventType.split('_')
  const head = parts[0] ?? ''
  const verb = parts.slice(1).join('_')
  return {
    resourceType: RESOURCE_MAP[head] ?? 'unknown',
    action: ACTION_MAP[verb] ?? 'unknown',
  }
}

export function verifyCheckoutComWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const sig = headers['cko-signature'] ?? headers['Cko-Signature']
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

export function parseCheckoutComWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const type = String(payload['type'] ?? '')
  const id = String(payload['id'] ?? '')
  const data = (payload['data'] as Record<string, unknown> | undefined) ?? {}
  const resourceId = String(data['id'] ?? '')
  const { resourceType, action } = classify(type)
  return [
    {
      id: id || undefined,
      platform: 'checkout-com',
      type,
      resourceType,
      action,
      resourceId,
      payload,
    },
  ]
}

export const CheckoutComWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyCheckoutComWebhook,
  parseWebhookEvents: parseCheckoutComWebhookEvents,
}
