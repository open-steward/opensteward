/**
 * Box Sign webhook verification + event parsing.
 *
 * Box signs deliveries with HMAC-SHA1 of `<delivery_timestamp><body>` using
 * the v1 primary key. Box rotates webhook keys via a primary/secondary
 * pair (`X-Box-Signature-Primary` + `X-Box-Signature-Secondary`); we
 * verify the primary signature. The algorithm header
 * `X-Box-Signature-Algorithm` is informational (always `HmacSHA256` or
 * `HmacSHA1` — Box has used SHA1 historically for Sign).
 *
 * Docs: https://developer.box.com/guides/webhooks/handle/setup-signatures/
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type {
  WebhookAction,
  WebhookEvent,
  WebhookResourceType,
} from '../../schema/webhook'

const PRIMARY_HEADER = 'x-box-signature-primary'
const SECONDARY_HEADER = 'x-box-signature-secondary'
const TIMESTAMP_HEADER = 'x-box-delivery-timestamp'

export function verifyBoxSignWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const timestamp =
      headers[TIMESTAMP_HEADER] ?? headers[TIMESTAMP_HEADER.toLowerCase()] ?? ''
    const provided =
      headers[PRIMARY_HEADER] ?? headers[PRIMARY_HEADER.toLowerCase()] ?? ''
    const fallback =
      headers[SECONDARY_HEADER] ?? headers[SECONDARY_HEADER.toLowerCase()] ?? ''
    if (!provided && !fallback) return false
    if (!timestamp) return false
    const message = Buffer.concat([Buffer.from(timestamp, 'utf8'), payload])
    const expected = createHmac('sha1', secret).update(message).digest('base64')
    const expectedBuf = Buffer.from(expected, 'utf8')
    for (const sig of [provided, fallback]) {
      if (!sig) continue
      const providedBuf = Buffer.from(sig.trim(), 'utf8')
      if (providedBuf.length !== expectedBuf.length) continue
      if (timingSafeEqual(providedBuf, expectedBuf)) return true
    }
    return false
  } catch {
    return false
  }
}

const ACTION_MAP: Record<string, WebhookAction> = {
  'SIGN_REQUEST.CREATED': 'created',
  'SIGN_REQUEST.SENT': 'sent',
  'SIGN_REQUEST.SIGNER_VIEWED': 'viewed',
  'SIGN_REQUEST.SIGNER_SIGNED': 'signed',
  'SIGN_REQUEST.SIGNED': 'completed',
  'SIGN_REQUEST.COMPLETED': 'completed',
  'SIGN_REQUEST.DECLINED': 'declined',
  'SIGN_REQUEST.CANCELLED': 'voided',
  'SIGN_REQUEST.EXPIRED': 'expired',
  'SIGN_REQUEST.ERROR_CONVERTING': 'expired',
  'SIGN_REQUEST.ERROR_FINALIZING': 'expired',
  'SIGN_REQUEST.ERROR_SENDING': 'expired',
}

function classify(event: string): {
  resourceType: WebhookResourceType
  action: WebhookAction
} {
  const upper = event.toUpperCase()
  if (upper.startsWith('SIGN_REQUEST.SIGNER_')) {
    return { resourceType: 'signers', action: ACTION_MAP[upper] ?? 'updated' }
  }
  if (upper.startsWith('SIGN_REQUEST.')) {
    return { resourceType: 'envelopes', action: ACTION_MAP[upper] ?? 'updated' }
  }
  if (upper.startsWith('SIGN_TEMPLATE.')) {
    return { resourceType: 'templates', action: ACTION_MAP[upper] ?? 'updated' }
  }
  return { resourceType: 'unknown', action: 'unknown' }
}

export function parseBoxSignWebhookEvents(
  payload: Record<string, unknown>,
): WebhookEvent[] {
  const trigger = String(payload['trigger'] ?? payload['event'] ?? '')
  const source = (payload['source'] as Record<string, unknown> | undefined) ?? {}
  const signRequestId = String(
    source['id'] ?? payload['sign_request_id'] ?? payload['id'] ?? '',
  )
  const signerId = String(payload['signer_id'] ?? source['signer_id'] ?? '')
  const { resourceType, action } = classify(trigger)
  const resourceId =
    resourceType === 'signers' ? signerId || signRequestId : signRequestId
  return [
    {
      id: `box-sign:${trigger}:${signRequestId}:${signerId}`,
      platform: 'box-sign',
      type: trigger || 'unknown',
      resourceType,
      action,
      resourceId,
      envelopeId: signRequestId || undefined,
      payload,
    },
  ]
}

export const BoxSignWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyBoxSignWebhook,
  parseWebhookEvents: parseBoxSignWebhookEvents,
}
