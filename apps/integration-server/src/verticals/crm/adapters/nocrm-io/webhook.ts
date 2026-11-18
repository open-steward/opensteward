/**
 * noCRM.io webhook handler.
 *
 * noCRM.io does not document a cryptographic signature on webhook POST bodies.
 * The platform fires JSON payloads for lead events; verification is done by
 * IP allow-listing or a shared secret that the customer configures in their
 * noCRM account (not a header-based HMAC). We therefore accept all inbound
 * payloads (return true) and parse the event type + lead data.
 *
 * Supported event types (as of 2026):
 *   lead.creation, lead.status.changed.to.*, lead.step.changed.to,
 *   lead.content_has_changed, lead.deleted, task.status.changed.to.*
 */

import type { WebhookEvent } from '../../schema/webhook'

export function verifyWebhook(
  _payload: Buffer,
  _headers: Record<string, string>,
  _secret: string,
): boolean {
  // noCRM.io does not provide a header-based HMAC signature.
  // Accept all; callers may optionally validate the secret via the URL token
  // that noCRM sends as a query parameter.
  return true
}

export function parseWebhookEvents(
  payload: Record<string, unknown>,
): WebhookEvent[] {
  const eventType = String(payload['event'] ?? payload['type'] ?? '')
  const lead = payload['lead'] as Record<string, unknown> | undefined

  if (!lead || !lead['id']) return []

  const action: WebhookEvent['action'] = eventType.includes('creation')
    ? 'created'
    : eventType.includes('deleted')
      ? 'deleted'
      : 'updated'

  return [
    {
      platform: 'nocrm-io',
      type: `lead.${action}`,
      resourceType: 'unknown',
      action,
      resourceId: String(lead['id']),
      payload,
    },
  ]
}

export const nocrmUioWebhook: import('@opensteward/shared').WebhookHandler = {
  verifyWebhook,
  parseWebhookEvents,
}
