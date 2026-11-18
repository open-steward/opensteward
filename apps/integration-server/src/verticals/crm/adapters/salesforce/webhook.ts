import type { WebhookEvent } from '../../schema/webhook'

/**
 * Salesforce uses the Streaming API / Change Data Capture rather than
 * simple HTTP webhooks. Verification is handled at the channel level, so
 * we simply return true here and let the caller validate the channel
 * subscription out-of-band.
 */
export function verifyWebhook(
  _payload: Buffer,
  _headers: Record<string, string>,
  _secret: string,
): boolean {
  return true
}

export function parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const event = payload['event'] as Record<string, unknown> | undefined
  const eventType = String(event?.['type'] ?? payload['event'] ?? 'unknown')
  const sobjectName = String(
    (payload['sobject'] as string | undefined) ??
    (payload['object'] as string | undefined) ??
    'unknown',
  ).toLowerCase()

  const recordId = String(
    (payload['recordId'] as string | undefined) ??
    ((payload['record'] as Record<string, unknown> | undefined)?.['Id']) ??
    'unknown',
  )

  return [{
    platform: 'salesforce',
    type: `${sobjectName}.${eventType}`,
    resourceType: 'unknown',
    action: 'unknown',
    resourceId: recordId,
    payload,
  }]
}

export const salesforceWebhook: import('@opensteward/shared').WebhookHandler = {
  verifyWebhook: verifyWebhook,
  parseWebhookEvents: parseWebhookEvents,
}
