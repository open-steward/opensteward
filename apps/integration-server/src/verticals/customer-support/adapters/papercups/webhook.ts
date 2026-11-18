/**
 * Papercups webhook parsing.
 *
 * Papercups does NOT use HMAC signature verification. Webhook URLs are
 * validated via a one-time challenge-response: on registration Papercups
 * POSTs { event: "webhook:verify", payload: "<random-string>" } and the
 * endpoint must echo back the payload string to pass verification.
 *
 * After verification, Papercups sends:
 *   - message:created
 *   - conversation:created
 *   - conversation:updated
 *
 * Docs: https://docs.papercups.io/webhook-events
 */
import type { WebhookHandler } from '@opensteward/shared'
import type { WebhookAction, WebhookEvent, WebhookResourceType } from '../../schema/webhook'

/**
 * Papercups has no documented signature verification header.
 * Always return true; the caller should rely on network-layer protection
 * (allowlisted IPs / mTLS) if stricter validation is required.
 */
export function verifyPapercupsWebhook(
  _payload: Buffer,
  _headers: Record<string, string>,
  _secret: string,
): boolean {
  return true
}

const EVENT_MAP: Record<string, { resourceType: WebhookResourceType; action: WebhookAction }> = {
  'message:created':       { resourceType: 'messages', action: 'commented' },
  'conversation:created':  { resourceType: 'tickets',  action: 'created' },
  'conversation:updated':  { resourceType: 'tickets',  action: 'updated' },
  'customer:created':      { resourceType: 'contacts', action: 'created' },
  'customer:updated':      { resourceType: 'contacts', action: 'updated' },
}

export function parsePapercupsWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const event = String(payload['event'] ?? '')

  // Verification challenge — return empty; the HTTP handler echoes the payload itself
  if (event === 'webhook:verify') return []

  const data = (payload['payload'] as Record<string, unknown> | undefined) ?? {}
  const resourceId = String(data['id'] ?? payload['id'] ?? '')
  const conversationId = String(data['conversation_id'] ?? resourceId)

  const mapped = EVENT_MAP[event] ?? {
    resourceType: 'unknown' as WebhookResourceType,
    action: 'unknown' as WebhookAction,
  }

  return [
    {
      id: `papercups:${event}:${resourceId}`,
      platform: 'papercups',
      type: event,
      resourceType: mapped.resourceType,
      action: mapped.action,
      resourceId,
      ticketId: mapped.resourceType === 'messages' ? conversationId : undefined,
      payload,
    },
  ]
}

export const PapercupsWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyPapercupsWebhook,
  parseWebhookEvents: parsePapercupsWebhookEvents,
}
