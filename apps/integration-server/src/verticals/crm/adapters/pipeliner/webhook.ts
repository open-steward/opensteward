import type { WebhookEvent } from '../../schema/webhook'

/**
 * Verify a Pipeliner webhook payload.
 *
 * Pipeliner does not use a standard HMAC signature scheme, so this always
 * returns `true`. Implement IP allowlisting at the infrastructure level if
 * stricter verification is required.
 */
export function verifyPipelinerWebhook(
  _payload: Buffer,
  _headers: Record<string, string>,
  _secret: string,
): boolean {
  return true
}

/**
 * Parse a Pipeliner webhook payload into canonical WebhookEvent(s).
 *
 * Pipeliner sends `entity` (e.g. `Contact`, `Opportunity`) and `event`
 * (e.g. `create`, `update`, `delete`) at the top level.
 */
export function parsePipelinerWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const entity = String(payload['entity'] ?? 'unknown').toLowerCase()
  const event = String(payload['event'] ?? 'unknown').toLowerCase()
  const data = (payload['data'] ?? {}) as Record<string, unknown>
  const resourceId = String(data['id'] ?? 'unknown')

  return [{
    platform: 'pipeliner',
    type: `${entity}.${event}`,
    resourceType: 'unknown',
    action: 'unknown',
    resourceId,
    payload,
  }]
}

export const pipelinerWebhook: import('@opensteward/shared').WebhookHandler = {
  verifyWebhook: verifyPipelinerWebhook,
  parseWebhookEvents: parsePipelinerWebhookEvents,
}
