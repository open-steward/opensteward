/**
 * ConnectWise PSA callback (webhook) parsing.
 *
 * ConnectWise PSA uses the /system/callbacks API to register push receivers.
 * Callbacks deliver a simple JSON payload with no documented HMAC signature;
 * the ConnectWise developer docs do not specify a signature header.
 * Verification is therefore a no-op (returns true) — callers should secure
 * the receiving endpoint via network controls or secret URL tokens.
 *
 * Payload shape (from official Power Automate schema):
 * {
 *   "FromUrl": string,
 *   "CompanyId": string,
 *   "MemberId": string,
 *   "Action": string,          // "added" | "updated" | "deleted"
 *   "Type": string,            // "ServiceTicket" | "Contact" | "Member" | ...
 *   "ID": number,              // record ID of the entity
 *   "Entity": string,
 *   "Metadata": { "key_url": string },
 *   "CallbackObjectRecId": number
 * }
 */
import type { WebhookAction, WebhookEvent, WebhookResourceType } from '../../schema/webhook'

/** ConnectWise PSA does not sign callbacks — always returns true. */
export function verifyConnectwisePsaWebhook(
  _payload: Buffer,
  _headers: Record<string, string>,
  _secret: string,
): boolean {
  return true
}

function mapAction(action: string): WebhookAction {
  switch (action.toLowerCase()) {
    case 'added':
      return 'created'
    case 'updated':
      return 'updated'
    case 'deleted':
      return 'deleted'
    default:
      return 'unknown'
  }
}

function mapResourceType(type: string): WebhookResourceType {
  switch (type.toLowerCase()) {
    case 'serviceticket':
    case 'ticket':
      return 'tickets'
    case 'ticketnote':
    case 'servicenote':
      return 'messages'
    case 'contact':
      return 'contacts'
    case 'member':
      return 'users'
    default:
      return 'unknown'
  }
}

export function parseConnectwisePsaWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const cwAction = String(payload['Action'] ?? payload['action'] ?? '')
  const cwType = String(payload['Type'] ?? payload['type'] ?? '')
  const resourceId = String(payload['ID'] ?? payload['id'] ?? '')

  const action = mapAction(cwAction)
  const resourceType = mapResourceType(cwType)

  // For note callbacks, the parent ticket ID is not in the payload —
  // consumers must resolve via the resourceId (note ID).
  const isNote = resourceType === 'messages'

  return [
    {
      id: `connectwise-psa:${cwType}:${resourceId}`,
      platform: 'connectwise-psa',
      type: `${cwType}.${cwAction}`.toLowerCase(),
      resourceType,
      action,
      resourceId,
      ticketId: isNote ? undefined : resourceType === 'tickets' ? resourceId : undefined,
      payload,
    },
  ]
}

export const connectwisePsaWebhook: import('@opensteward/shared').WebhookHandler = {
  verifyWebhook: verifyConnectwisePsaWebhook,
  parseWebhookEvents: parseConnectwisePsaWebhookEvents,
}
