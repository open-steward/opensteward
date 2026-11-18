/**
 * EngageBay webhook handler.
 *
 * EngageBay does not document a cryptographic signature scheme for its
 * webhooks. Verification is therefore a no-op that always returns true.
 * Operators should restrict inbound traffic to EngageBay IP ranges as an
 * alternative security control.
 *
 * Webhook payload shape: EngageBay sends a JSON object with an `event`
 * string and the affected entity under a matching key.
 */
import type { WebhookEvent } from '../../schema/webhook'

export function verifyWebhook(
  _payload: Buffer,
  _headers: Record<string, string>,
  _secret: string,
): boolean {
  // EngageBay does not publish a signing scheme — always accept.
  return true
}

export function parseWebhookEvents(
  payload: Record<string, unknown>,
): WebhookEvent[] {
  const event = typeof payload['event'] === 'string' ? payload['event'] : 'unknown'
  const [resourceRaw, actionRaw] = event.split('.')

  return [
    {
      platform: 'engagebay',
      type: event,
      resourceType: mapResource(resourceRaw ?? ''),
      action: mapAction(actionRaw ?? ''),
      resourceId: extractId(payload),
      payload,
    },
  ]
}

function mapResource(_raw: string): WebhookEvent['resourceType'] {
  // The CRM vertical's WebhookResourceTypeSchema only exposes 'unknown' today.
  return 'unknown'
}

function mapAction(raw: string): WebhookEvent['action'] {
  const map: Record<string, WebhookEvent['action']> = {
    created: 'created',
    create: 'created',
    updated: 'updated',
    update: 'updated',
    deleted: 'deleted',
    delete: 'deleted',
  }
  return map[raw.toLowerCase()] ?? 'unknown'
}

function extractId(payload: Record<string, unknown>): string {
  const candidate =
    (payload['id'] as string | number | undefined) ??
    (payload['contact_id'] as string | number | undefined) ??
    (payload['entity_id'] as string | number | undefined)
  return candidate != null ? String(candidate) : 'unknown'
}

export const engagebayWebhook: import('@opensteward/shared').WebhookHandler = {
  verifyWebhook,
  parseWebhookEvents,
}
