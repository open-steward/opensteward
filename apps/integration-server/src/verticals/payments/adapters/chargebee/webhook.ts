/**
 * Chargebee webhooks ship with HTTP Basic-auth headers (the configured
 * webhook username + password) — there's no HMAC signature scheme. v1 of
 * the adapter accepts structurally and lets the route-level Basic-auth
 * check the credential.
 *
 * Docs: https://apidocs.chargebee.com/docs/api/events
 */
import type { WebhookHandler } from '@opensteward/shared'
import type {
  WebhookEvent,
  WebhookResourceType,
  WebhookAction,
} from '../../schema/webhook'

const RESOURCE_MAP: Record<string, WebhookResourceType> = {
  subscription: 'subscriptions',
  customer: 'customers',
  invoice: 'invoices',
  transaction: 'charges',
  credit_note: 'refunds',
  payment_source: 'payment_methods',
}

const ACTION_MAP: Record<string, WebhookAction> = {
  created: 'created',
  changed: 'updated',
  cancelled: 'cancelled',
  canceled: 'cancelled',
  paused: 'updated',
  reactivated: 'updated',
  renewed: 'updated',
  paid: 'paid',
  payment_succeeded: 'paid',
  payment_failed: 'failed',
  generated: 'created',
  refunded: 'refunded',
}

function classify(eventType: string): { resourceType: WebhookResourceType; action: WebhookAction } {
  // Chargebee event format: `<resource>_<action>` e.g. subscription_renewed
  const idx = eventType.indexOf('_')
  if (idx === -1) return { resourceType: 'unknown', action: 'unknown' }
  const head = eventType.slice(0, idx)
  const verb = eventType.slice(idx + 1)
  return {
    resourceType: RESOURCE_MAP[head] ?? 'unknown',
    action: ACTION_MAP[verb] ?? 'unknown',
  }
}

export function verifyChargebeeWebhook(
  _payload: Buffer,
  _headers: Record<string, string>,
  _secret: string,
): boolean {
  // Chargebee uses HTTP Basic auth on the receiver side; verification
  // happens at the reverse-proxy / route-handler level, not here.
  return true
}

export function parseChargebeeWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const eventType = String(payload['event_type'] ?? '')
  const id = String(payload['id'] ?? '')
  const content = (payload['content'] as Record<string, unknown> | undefined) ?? {}
  const inner = Object.values(content)[0] as Record<string, unknown> | undefined
  const resourceId = String(inner?.['id'] ?? '')
  const { resourceType, action } = classify(eventType)
  return [
    {
      id: id || undefined,
      platform: 'chargebee',
      type: eventType,
      resourceType,
      action,
      resourceId,
      payload,
    },
  ]
}

export const ChargebeeWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyChargebeeWebhook,
  parseWebhookEvents: parseChargebeeWebhookEvents,
}
