import type { WebhookEvent } from '../../schema/webhook'

/**
 * Mixmax webhook support.
 *
 * Mixmax outgoing webhooks are fired via "Rules" (Settings > Rules > Outgoing
 * Webhooks). The payload is an arbitrary JSON object whose structure depends
 * on the rule template. Mixmax does NOT document a signature-verification
 * scheme, so verifyWebhook always returns true — callers must protect the
 * endpoint via network-level controls or a shared secret in the URL.
 *
 * Common event field: `eventName` (e.g. "message:sent", "opened", "clicked").
 */

export function verifyWebhook(
  _payload: Buffer,
  _headers: Record<string, string>,
  _secret: string,
): boolean {
  // No signature scheme documented; accept all inbound calls.
  return true
}

export function parseWebhookEvents(
  payload: Record<string, unknown>,
): WebhookEvent[] {
  const events = Array.isArray(payload) ? payload : [payload]

  return events.flatMap((event) => {
    const ev = event as Record<string, unknown>
    const eventName = typeof ev['eventName'] === 'string' ? ev['eventName'] : 'unknown'
    const resourceId = String(
      ev['messageId'] ?? ev['userId'] ?? ev['recipientEmail'] ?? 'unknown',
    )
    const action = deriveAction(eventName)

    const result: WebhookEvent = {
      platform: 'mixmax',
      type: eventName,
      resourceType: 'unknown' as WebhookEvent['resourceType'],
      action,
      resourceId,
      payload: ev,
    }
    return [result]
  })
}

function deriveAction(eventName: string): WebhookEvent['action'] {
  if (eventName.endsWith(':created') || eventName.endsWith(':sent')) return 'created'
  if (eventName.endsWith(':updated')) return 'updated'
  if (eventName.endsWith(':deleted') || eventName.endsWith(':unsubscribed')) return 'deleted'
  return 'unknown'
}

export const mixmaxWebhook: import('@opensteward/shared').WebhookHandler = {
  verifyWebhook,
  parseWebhookEvents,
}
