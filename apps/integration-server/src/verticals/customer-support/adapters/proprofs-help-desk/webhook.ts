/**
 * ProProfs Help Desk webhook parsing.
 *
 * ProProfs does not sign webhook payloads with an HMAC secret — the only
 * security mechanism is a URL-verification handshake performed at setup time
 * (ProProfs POSTs { type: "url_verification", challenge: "<token>" } and
 * expects { challenge_response: "<token>" } back).
 *
 * Because there is no runtime signature to verify, verifyProprofsWebhook
 * always returns true. Callers MUST restrict delivery to trusted IP ranges
 * or use a webhook-proxy with a pre-shared secret at the transport layer.
 *
 * Supported event types:
 *   ticket.created  — a new ticket was opened
 *   ticket.reply    — a reply was added to an existing ticket
 *
 * Docs: https://help.proprofsdesk.com/configure-webhooks-in-proprofs-help-desk
 */
import type { WebhookAction, WebhookEvent, WebhookResourceType } from '../../schema/webhook'

 
export function verifyProprofsWebhook(
  _payload: Buffer,
  _headers: Record<string, string>,
  _secret: string,
): boolean {
  // ProProfs does not provide an HMAC signature header — nothing to verify.
  return true
}

const ACTION_MAP: Record<string, { resourceType: WebhookResourceType; action: WebhookAction }> = {
  'ticket.created': { resourceType: 'tickets', action: 'created' },
  'ticket.reply':   { resourceType: 'messages', action: 'commented' },
}

export function parseProprofsWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const type     = String(payload['type'] ?? '')
  const ticketId = String(payload['ticket_id'] ?? payload['id'] ?? '')
  const mapped   = ACTION_MAP[type] ?? {
    resourceType: 'unknown' as WebhookResourceType,
    action: 'unknown' as WebhookAction,
  }

  return [
    {
      id:           `proprofs-help-desk:${type}:${ticketId}`,
      platform:     'proprofs-help-desk',
      type,
      resourceType: mapped.resourceType,
      action:       mapped.action,
      resourceId:   ticketId,
      ticketId:     mapped.resourceType === 'messages' ? ticketId : undefined,
      payload,
    },
  ]
}

export const proprofsWebhook: import('@opensteward/shared').WebhookHandler = {
  verifyWebhook: verifyProprofsWebhook,
  parseWebhookEvents: parseProprofsWebhookEvents,
}
