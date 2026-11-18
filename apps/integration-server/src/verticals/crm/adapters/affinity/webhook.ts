import { verifyHmacSha256 } from '@opensteward/shared'
import type { WebhookEvent } from '../../schema/webhook'

/**
 * Verify an Affinity webhook delivery.
 *
 * Affinity signs payloads with HMAC-SHA256 and sends the hex digest in the
 * `X-Affinity-Signature` header.
 */
export function verifyWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  return verifyHmacSha256(payload, secret, headers['x-affinity-signature'] ?? '', 'hex')
}

/**
 * Parse Affinity webhook payload into canonical WebhookEvent(s).
 */
export function parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const type = String(payload['type'] ?? 'unknown')
  const id = String(
    (payload['id'] as string | number | undefined) ?? 'unknown',
  )
  return [{
    platform: 'affinity',
    type,
    resourceType: 'unknown',
    action: 'unknown',
    resourceId: id,
    payload,
  }]
}

export const affinityWebhook: import('@opensteward/shared').WebhookHandler = {
  verifyWebhook: verifyWebhook,
  parseWebhookEvents: parseWebhookEvents,
}
