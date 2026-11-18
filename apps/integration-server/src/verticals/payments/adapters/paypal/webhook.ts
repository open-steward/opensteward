/**
 * PayPal webhook handler.
 *
 * Full signature verification on PayPal requires calling the
 * `Verify Webhook Signature` endpoint with the configured webhook id +
 * incoming headers; that adds a round-trip and requires an authenticated
 * client. For v1 we expose a structural check (header presence) and
 * surface the canonical event mapping. Add network-side verification by
 * wiring the verifier into the dispatcher layer when stricter auth is
 * required.
 *
 * Event types: https://developer.paypal.com/api/rest/webhooks/event-names/
 */

import type { WebhookHandler } from '@opensteward/shared'
import type {
  WebhookEvent,
  WebhookResourceType,
  WebhookAction,
} from '../../schema/webhook'

const RESOURCE_MAP: Record<string, WebhookResourceType> = {
  PAYMENT: 'charges',
  CAPTURE: 'charges',
  REFUND: 'refunds',
  BILLING: 'subscriptions',
  INVOICING: 'invoices',
  CUSTOMER: 'disputes',
  PAYOUTS: 'payouts',
}

const ACTION_MAP: Record<string, WebhookAction> = {
  COMPLETED: 'succeeded',
  CREATED: 'created',
  UPDATED: 'updated',
  CAPTURED: 'paid',
  REFUNDED: 'refunded',
  DENIED: 'failed',
  CANCELLED: 'cancelled',
  ACTIVATED: 'created',
  SUSPENDED: 'updated',
  PAID: 'paid',
  RESOLVED: 'updated',
}

function classify(eventType: string): {
  resourceType: WebhookResourceType
  action: WebhookAction
} {
  const parts = eventType.split('.')
  const top = parts[0] ?? ''
  const verb = parts[parts.length - 1] ?? ''
  return {
    resourceType: RESOURCE_MAP[top] ?? 'unknown',
    action: ACTION_MAP[verb] ?? 'unknown',
  }
}

export function verifyPayPalWebhook(
  _payload: Buffer,
  headers: Record<string, string>,
  _secret: string,
): boolean {
  // Header-presence check. Production-grade verification posts to
  // /v1/notifications/verify-webhook-signature with the configured webhook id
  // — that path requires an authenticated client, so it lives in the
  // dispatcher layer rather than this synchronous handler.
  const sig = headers['paypal-transmission-sig'] ?? headers['Paypal-Transmission-Sig']
  const transId = headers['paypal-transmission-id'] ?? headers['Paypal-Transmission-Id']
  return Boolean(sig && transId)
}

export function parsePayPalWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const eventType = String(payload['event_type'] ?? '')
  const id = String(payload['id'] ?? '')
  const resource = (payload['resource'] as Record<string, unknown> | undefined) ?? {}
  const resourceId = String(resource['id'] ?? resource['payment_id'] ?? '')
  const { resourceType, action } = classify(eventType)
  return [
    {
      id: id || undefined,
      platform: 'paypal',
      type: eventType,
      resourceType,
      action,
      resourceId,
      payload,
    },
  ]
}

export const PayPalWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyPayPalWebhook,
  parseWebhookEvents: parsePayPalWebhookEvents,
}
