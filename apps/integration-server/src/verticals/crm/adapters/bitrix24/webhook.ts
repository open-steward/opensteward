import crypto from 'node:crypto'
import type { WebhookEvent } from '../../schema/webhook'

/**
 * Verify a Bitrix24 webhook.
 *
 * Bitrix24 uses HMAC-SHA1 of the raw body signed with the webhook secret.
 * The signature is sent in the `X-Bitrix-Signature` header.
 */
export function verifyBitrix24Webhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  const signature = headers['x-bitrix-signature'] ?? headers['X-Bitrix-Signature']
  if (!signature) return false

  const expected = crypto
    .createHmac('sha1', secret)
    .update(payload)
    .digest('hex')

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expected),
    )
  } catch {
    return false
  }
}

const EVENT_MAP: Record<string, { resourceType: WebhookEvent['resourceType']; action: WebhookEvent['action'] }> = {
  ONCRMCONTACTADD: { resourceType: 'unknown', action: 'created' },
  ONCRMCONTACTUPDATE: { resourceType: 'unknown', action: 'updated' },
  ONCRMCONTACTDELETE: { resourceType: 'unknown', action: 'deleted' },
  ONCRMCOMPANYADD: { resourceType: 'unknown', action: 'created' },
  ONCRMCOMPANYUPDATE: { resourceType: 'unknown', action: 'updated' },
  ONCRMCOMPANYDELETE: { resourceType: 'unknown', action: 'deleted' },
  ONCRMDEALADD: { resourceType: 'unknown', action: 'created' },
  ONCRMDEALUPDATE: { resourceType: 'unknown', action: 'updated' },
  ONCRMDEALDELETE: { resourceType: 'unknown', action: 'deleted' },
}

export function parseBitrix24WebhookEvents(
  payload: Record<string, unknown>,
): WebhookEvent[] {
  const event = String(payload['event'] ?? 'unknown').toUpperCase()
  const mapped = EVENT_MAP[event] ?? { resourceType: 'unknown' as const, action: 'unknown' as const }

  const data = payload['data'] as Record<string, unknown> | undefined
  const fields = data?.['FIELDS'] as Record<string, unknown> | undefined
  const resourceId = String(fields?.['ID'] ?? payload['id'] ?? 'unknown')

  return [{
    platform: 'bitrix24',
    type: event.toLowerCase(),
    resourceType: mapped.resourceType,
    action: mapped.action,
    resourceId,
    payload,
  }]
}

export const bitrix24Webhook: import('@opensteward/shared').WebhookHandler = {
  verifyWebhook: verifyBitrix24Webhook,
  parseWebhookEvents: parseBitrix24WebhookEvents,
}
