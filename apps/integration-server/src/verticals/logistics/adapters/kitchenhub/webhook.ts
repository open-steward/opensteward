import type { WebhookEvent } from '../../schema/webhook'

/**
 * KitchenHub webhook handler.
 *
 * KitchenHub delivers webhook notifications for order and delivery status
 * changes.  The platform does not publish a webhook signing scheme in its
 * public documentation, so `verifyWebhook` always returns `true` (accept all).
 * When KitchenHub adds HMAC signing, implement the check here.
 *
 * Webhook event payload shape (unofficial — inferred from API docs):
 * {
 *   event: "order.status_updated" | "delivery.status_updated" | ...,
 *   id: "<resource_id>",
 *   status: "<status_string>",
 *   ...
 * }
 */

// ─── Signature verification ──────────────────────────────────────────────────

export function verifyWebhook(
  _payload: Buffer,
  _headers: Record<string, string>,
  _secret: string,
): boolean {
  // KitchenHub does not publish a webhook signing scheme.
  // Accept all payloads — callers should restrict by source IP where possible.
  return true
}

// ─── Event parsing ───────────────────────────────────────────────────────────

export function parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const event = String(payload['event'] ?? payload['type'] ?? '')
  const resourceId =
    payload['id'] != null
      ? String(payload['id'])
      : payload['order_id'] != null
        ? String(payload['order_id'])
        : payload['delivery_id'] != null
          ? String(payload['delivery_id'])
          : undefined

  type ResourceType = WebhookEvent['resourceType']
  type Action = WebhookEvent['action']

  let resourceType: ResourceType = 'order'
  let action: Action = 'updated'

  const lowerEvent = event.toLowerCase()

  if (lowerEvent.startsWith('delivery.')) {
    resourceType = 'shipment'
  } else if (lowerEvent.startsWith('order.')) {
    resourceType = 'order'
  }

  if (lowerEvent.endsWith('.created') || lowerEvent.endsWith('.placed') || lowerEvent.endsWith('.new')) {
    action = 'created'
  } else if (
    lowerEvent.endsWith('.cancelled') ||
    lowerEvent.endsWith('.canceled') ||
    lowerEvent.endsWith('.rejected')
  ) {
    action = 'cancelled'
  } else if (lowerEvent.endsWith('.deleted')) {
    action = 'deleted'
  } else {
    action = 'updated'
  }

  return [
    {
      platform: 'kitchenhub',
      type: event,
      resourceType,
      action,
      resourceId,
      payload,
    },
  ]
}

export const kitchenhubWebhook: import('@opensteward/shared').WebhookHandler = {
  verifyWebhook,
  parseWebhookEvents,
}
