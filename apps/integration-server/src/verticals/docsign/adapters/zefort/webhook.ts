import { timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type { WebhookAction, WebhookEvent, WebhookResourceType } from '../../schema/webhook'

/**
 * Zefort webhook handling.
 *
 * Zefort does NOT HMAC-sign deliveries. Instead it authenticates every
 * callback with a static shared bearer token configured in the integration
 * settings: each request carries `Authorization: Bearer <token>`. Verifying
 * the delivery therefore means timing-safe comparing that header against the
 * configured token (which OpenSteward stores as the webhook "secret").
 *
 * Payloads follow the CloudEvents 1.0 envelope:
 *   { specversion, id, source, type, subject, time, data, obj_type, verb,
 *     api_url, ui_url }
 *
 * Docs: https://developers.zefort.com/docs/working-with-webhooks/
 */

const BEARER_PREFIX = /^Bearer\s+/i

export function verifyZefortWebhook(
  _payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const header = headers['authorization'] ?? headers['Authorization']
    if (!header || !secret) return false
    const token = header.replace(BEARER_PREFIX, '').trim()
    const a = Buffer.from(token, 'utf8')
    const b = Buffer.from(secret.trim(), 'utf8')
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

const ACTION_MAP: Record<string, { resourceType: WebhookResourceType; action: WebhookAction }> = {
  contract_created: { resourceType: 'envelopes', action: 'created' },
  contract_updated: { resourceType: 'envelopes', action: 'updated' },
  document_created: { resourceType: 'documents', action: 'created' },
  attribute_created: { resourceType: 'envelopes', action: 'updated' },
}

export function parseZefortWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const type = String(payload['type'] ?? '')
  const eventId = String(payload['id'] ?? '')
  const data = (payload['data'] as Record<string, unknown> | undefined) ?? {}
  const resourceId = String(payload['subject'] ?? data['id'] ?? data['contract'] ?? '')
  const { resourceType, action } = ACTION_MAP[type] ?? {
    resourceType: 'unknown' as WebhookResourceType,
    action: 'unknown' as WebhookAction,
  }
  return [
    {
      id: eventId || `zefort:${type}:${resourceId}`,
      platform: 'zefort',
      type,
      resourceType,
      action,
      resourceId,
      envelopeId: resourceType === 'envelopes' ? resourceId || undefined : undefined,
      payload,
    },
  ]
}

export const ZefortWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyZefortWebhook,
  parseWebhookEvents: parseZefortWebhookEvents,
}
