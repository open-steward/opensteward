import type { WebhookEvent } from '../../schema/webhook'

/**
 * Dynamics 365 uses Service Bus / Power Automate for eventing — not simple
 * HTTP webhooks. Verification is handled at the channel level, so we return
 * true here and let the caller manage subscription security out-of-band.
 */
export function verifyWebhook(
  _payload: Buffer,
  _headers: Record<string, string>,
  _secret: string,
): boolean {
  return true
}

export function parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const entityName = String(
    (payload['EntityName'] as string | undefined) ??
    (payload['entityName'] as string | undefined) ??
    'unknown',
  ).toLowerCase()

  const messageType = String(
    (payload['MessageName'] as string | undefined) ??
    (payload['messageName'] as string | undefined) ??
    'unknown',
  ).toLowerCase()

  const recordId = String(
    (payload['PrimaryEntityId'] as string | undefined) ??
    (payload['primaryEntityId'] as string | undefined) ??
    ((payload['InputParameters'] as Record<string, unknown> | undefined)?.['Target'] as string | undefined) ??
    'unknown',
  )

  return [{
    platform: 'dynamics365-crm',
    type: `${entityName}.${messageType}`,
    resourceType: 'unknown',
    action: 'unknown',
    resourceId: recordId,
    payload,
  }]
}

export const dynamics365CrmWebhook: import('@opensteward/shared').WebhookHandler = {
  verifyWebhook: verifyWebhook,
  parseWebhookEvents: parseWebhookEvents,
}
