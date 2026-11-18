/**
 * Accelo webhook handler.
 *
 * Accelo supports webhook subscriptions via the /webhooks API. Accelo's
 * official docs do not document a request-signature header or HMAC
 * verification mechanism, so `verifyWebhook` always returns `true` (accept
 * all inbound requests — operators SHOULD restrict the source IP at the network
 * layer until Accelo documents a signing mechanism).
 *
 * Accelo webhook payload structure (POST body):
 *   {
 *     "id":          "...",        // event id
 *     "type":        "created",    // created | updated | deleted
 *     "object_type": "contact",    // resource type
 *     "object_id":   "123",        // resource id
 *     "deployment":  "mycompany",  // tenant deployment slug
 *     "data":        { ... }       // snapshot of the changed object (optional)
 *   }
 */

import type { WebhookEvent } from '../../schema/webhook'

export function verifyAcceloWebhook(
  _payload: Buffer,
  _headers: Record<string, string>,
  _secret: string,
): boolean {
  // Accelo does not document a signing mechanism at this time.
  // Accept all inbound requests and rely on network-level controls.
  return true
}

export function parseAcceloWebhookEvents(
  payload: Record<string, unknown>,
): WebhookEvent[] {
  // Accelo may deliver a single event or an array.
  const events: Record<string, unknown>[] = Array.isArray(payload)
    ? (payload as Record<string, unknown>[])
    : [payload]

  return events.map((event) => {
    const objectType = String(event['object_type'] ?? event['type'] ?? 'unknown')
    const rawAction = String(event['action'] ?? event['type'] ?? 'unknown')
    const resourceId = String(event['object_id'] ?? event['id'] ?? 'unknown')
    const deployment = String(event['deployment'] ?? '')

    return {
      id: event['id'] != null ? String(event['id']) : undefined,
      platform: 'accelo',
      type: `${objectType}.${rawAction}`,
      resourceType: 'unknown' as WebhookEvent['resourceType'],
      action: mapAction(rawAction),
      resourceId,
      tenantId: deployment || undefined,
      payload: event,
    }
  })
}

function mapAction(raw: string): WebhookEvent['action'] {
  const lower = raw.toLowerCase()
  if (lower === 'created' || lower === 'create') return 'created'
  if (lower === 'updated' || lower === 'update' || lower === 'modified') return 'updated'
  if (lower === 'deleted' || lower === 'delete') return 'deleted'
  return 'unknown'
}

export const acceloWebhook: import('@opensteward/shared').WebhookHandler = {
  verifyWebhook: verifyAcceloWebhook,
  parseWebhookEvents: parseAcceloWebhookEvents,
}
