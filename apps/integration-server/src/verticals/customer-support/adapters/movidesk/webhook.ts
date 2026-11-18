/**
 * Movidesk (Zenvia Service) webhook parsing.
 *
 * Movidesk webhooks are fired by trigger automations (Settings > Triggers).
 * The platform does NOT document a cryptographic signature header, so
 * verifyWebhook always returns true (callers should protect the endpoint
 * via network controls or a shared secret in the webhook URL token if needed).
 *
 * Webhook payload shape (ticket-context):
 * {
 *   "Id": number,
 *   "Type": number,
 *   "Subject": string,
 *   "Urgency": string,
 *   "Status": string,
 *   "Origin": number,
 *   "IsDeleted": boolean,
 *   "Actions": [...],
 *   "WebhookEvents": [{ "Criteria": ..., "Operation": ... }]
 * }
 *
 * The Criteria + Operation in WebhookEvents tell us what triggered the hook.
 * We map them to canonical resource/action pairs.
 */
import type { WebhookAction, WebhookEvent, WebhookResourceType } from '../../schema/webhook'

interface RawWebhookEventEntry {
  Criteria?: string | null
  Operation?: string | null
  [key: string]: unknown
}

interface RawMovideskWebhookPayload {
  Id?: number | null
  Type?: number | null
  Subject?: string | null
  Status?: string | null
  Actions?: Array<{ Id?: number }> | null
  WebhookEvents?: RawWebhookEventEntry[] | null
  [key: string]: unknown
}

function deriveResourceAndAction(
  criteria: string,
  operation: string,
): { resourceType: WebhookResourceType; action: WebhookAction } {
  const c = criteria.toLowerCase()
  const o = operation.toLowerCase()

  // Ticket events
  if (c.includes('ticket') || c === '') {
    if (o === 'create' || o === 'created') return { resourceType: 'tickets', action: 'created' }
    if (o === 'resolve' || o === 'resolved') return { resourceType: 'tickets', action: 'resolved' }
    if (o === 'close' || o === 'closed') return { resourceType: 'tickets', action: 'closed' }
    if (o === 'assign' || o === 'assigned') return { resourceType: 'tickets', action: 'assigned' }
    return { resourceType: 'tickets', action: 'updated' }
  }
  // Action/message events
  if (c.includes('action') || c.includes('comment') || c.includes('message')) {
    return { resourceType: 'messages', action: 'commented' }
  }
  return { resourceType: 'tickets', action: 'updated' }
}

/** Movidesk does not provide a webhook signature — always returns true. */
export function verifyMovideskWebhook(
  _payload: Buffer,
  _headers: Record<string, string>,
  _secret: string,
): boolean {
  return true
}

export function parseMovideskWebhookEvents(
  payload: Record<string, unknown>,
): WebhookEvent[] {
  const raw = payload as RawMovideskWebhookPayload
  const ticketId = String(raw.Id ?? '')
  const events: RawWebhookEventEntry[] = raw.WebhookEvents ?? []

  if (events.length === 0) {
    // No WebhookEvents block — treat as a generic ticket update
    return [
      {
        id: `movidesk:ticket:updated:${ticketId}`,
        platform: 'movidesk',
        type: 'ticket.updated',
        resourceType: 'tickets',
        action: 'updated',
        resourceId: ticketId,
        payload,
      },
    ]
  }

  return events.map((evt) => {
    const criteria = String(evt.Criteria ?? '')
    const operation = String(evt.Operation ?? '')
    const { resourceType, action } = deriveResourceAndAction(criteria, operation)
    const type = `movidesk:${criteria}:${operation}`.toLowerCase()
    return {
      id: `movidesk:${type}:${ticketId}`,
      platform: 'movidesk',
      type,
      resourceType,
      action,
      resourceId: ticketId,
      ticketId: resourceType === 'messages' ? ticketId : undefined,
      payload,
    }
  })
}

export const movideskWebhook: import('@opensteward/shared').WebhookHandler = {
  verifyWebhook: verifyMovideskWebhook,
  parseWebhookEvents: parseMovideskWebhookEvents,
}
