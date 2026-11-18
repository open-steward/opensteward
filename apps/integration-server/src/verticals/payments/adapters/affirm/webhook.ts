/**
 * Affirm webhook deliveries arrive at the merchant URL configured in the
 * dashboard. Affirm signs deliveries with HMAC-SHA-256 using the shared
 * secret, hex-encoded in the `X-Affirm-Signature` header.
 *
 * Docs: https://docs.affirm.com/affirm-developers/reference/webhooks
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
  refund: 'refunds',
  loan: 'charges',
}

const ACTION_MAP: Record<string, WebhookAction> = {
  authorized: 'created',
  captured: 'paid',
  voided: 'voided',
  refunded: 'refunded',
  failed: 'failed',
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

export function verifyAffirmWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const sig = headers['x-affirm-signature'] ?? headers['X-Affirm-Signature']
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

export function parseAffirmWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const type = String(payload['type'] ?? payload['event_type'] ?? '')
  const id = String(payload['id'] ?? '')
  const resourceId = String(payload['charge_id'] ?? payload['loan_id'] ?? payload['id'] ?? '')
  const { resourceType, action } = classify(type)
  return [
    {
      id: id || undefined,
      platform: 'affirm',
      type,
      resourceType,
      action,
      resourceId,
      payload,
    },
  ]
}

export const AffirmWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyAffirmWebhook,
  parseWebhookEvents: parseAffirmWebhookEvents,
}
