/**
 * Authorize.Net webhooks ship with an `X-ANET-Signature` header — HMAC-SHA-512
 * of the raw body using the signature key, hex-encoded and prefixed with
 * `sha512=`.
 *
 * Docs: https://developer.authorize.net/api/reference/features/webhooks.html
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type {
  WebhookEvent,
  WebhookResourceType,
  WebhookAction,
} from '../../schema/webhook'

const RESOURCE_MAP: Record<string, WebhookResourceType> = {
  paymentauthorization: 'charges',
  paymentauthcapture: 'charges',
  paymentcapture: 'charges',
  paymentrefund: 'refunds',
  paymentvoid: 'charges',
  fraudapproved: 'charges',
  fraudheld: 'charges',
  fraudauto: 'charges',
  fraudauthorized: 'charges',
  subscription: 'subscriptions',
  customer: 'customers',
}

const ACTION_MAP: Record<string, WebhookAction> = {
  created: 'created',
  updated: 'updated',
  approved: 'paid',
  declined: 'failed',
  refunded: 'refunded',
  voided: 'voided',
  cancelled: 'cancelled',
  canceled: 'cancelled',
}

function classify(eventType: string): { resourceType: WebhookResourceType; action: WebhookAction } {
  // Format: net.authorize.payment.authcapture.created
  const parts = eventType.toLowerCase().split('.')
  if (parts.length < 4) return { resourceType: 'unknown', action: 'unknown' }
  const headBits = parts.slice(2, parts.length - 1).join('')
  const verb = parts[parts.length - 1] ?? ''
  return {
    resourceType: RESOURCE_MAP[headBits] ?? RESOURCE_MAP[parts[2] ?? ''] ?? 'unknown',
    action: ACTION_MAP[verb] ?? 'unknown',
  }
}

export function verifyAuthorizeNetWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const header = headers['x-anet-signature'] ?? headers['X-ANET-Signature']
    if (!header) return false
    const sig = header.replace(/^sha512=/i, '').trim()
    const expected = createHmac('sha512', secret).update(payload).digest('hex')
    const a = Buffer.from(sig, 'hex')
    const b = Buffer.from(expected, 'hex')
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

export function parseAuthorizeNetWebhookEvents(
  payload: Record<string, unknown>,
): WebhookEvent[] {
  const type = String(payload['eventType'] ?? '')
  const id = String(payload['notificationId'] ?? '')
  const data = (payload['payload'] as Record<string, unknown> | undefined) ?? {}
  const resourceId = String(data['id'] ?? '')
  const { resourceType, action } = classify(type)
  return [
    {
      id: id || undefined,
      platform: 'authorize-net',
      type,
      resourceType,
      action,
      resourceId,
      payload,
    },
  ]
}

export const AuthorizeNetWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyAuthorizeNetWebhook,
  parseWebhookEvents: parseAuthorizeNetWebhookEvents,
}
