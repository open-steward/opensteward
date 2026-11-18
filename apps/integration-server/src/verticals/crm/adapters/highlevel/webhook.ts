import type { WebhookEvent } from '../../schema/webhook'

/**
 * Verify a HighLevel webhook request.
 *
 * HighLevel v2 does not use HMAC signing — always returns true.
 * Implement IP allow-listing or a shared secret query param at the routing
 * layer if you need additional security.
 */
export function verifyHighLevelWebhook(
  _payload: Buffer,
  _headers: Record<string, string>,
  _secret: string,
): boolean {
  return true
}

/**
 * Parse an incoming HighLevel webhook payload into canonical WebhookEvents.
 *
 * HighLevel sends a `type` field that identifies the event, e.g.
 * `ContactCreate`, `ContactUpdate`, `OpportunityCreate`, etc.
 */
export function parseHighLevelWebhookEvents(
  payload: Record<string, unknown>,
): WebhookEvent[] {
  const type = String(payload['type'] ?? '')
  const id = String(payload['id'] ?? payload['contactId'] ?? payload['opportunityId'] ?? 'unknown')

  const actionMap: Record<string, WebhookEvent['action']> = {
    Create: 'created',
    Update: 'updated',
    Delete: 'deleted',
  }

  let action: WebhookEvent['action'] = 'unknown'
  for (const [suffix, a] of Object.entries(actionMap)) {
    if (type.endsWith(suffix)) {
      action = a
      break
    }
  }

  return [{
    platform: 'highlevel',
    type: type.toLowerCase(),
    resourceType: 'unknown',
    action,
    resourceId: id,
    payload,
  }]
}

export const highlevelWebhook: import('@opensteward/shared').WebhookHandler = {
  verifyWebhook: verifyHighLevelWebhook,
  parseWebhookEvents: parseHighLevelWebhookEvents,
}
