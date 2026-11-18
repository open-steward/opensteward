/**
 * RightSignature webhook verification + event parsing.
 *
 * RightSignature signs deliveries with HMAC-SHA256 of the raw body using
 * the per-webhook secret. The signature ships hex-encoded in the
 * `X-RightSignature-Signature` header. The verifier accepts bare hex or
 * `sha256=<hex>`.
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type {
  WebhookAction,
  WebhookEvent,
  WebhookResourceType,
} from '../../schema/webhook'

const SIG_HEADERS = ['x-rightsignature-signature', 'x-rs-signature']

function pickSignature(headers: Record<string, string>): string | undefined {
  for (const [k, v] of Object.entries(headers)) {
    if (SIG_HEADERS.includes(k.toLowerCase())) {
      return v.startsWith('sha256=') ? v.slice('sha256='.length) : v
    }
  }
  return undefined
}

export function verifyRightSignatureWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const provided = pickSignature(headers)
    if (!provided) return false
    const expected = createHmac('sha256', secret).update(payload).digest('hex')
    const a = Buffer.from(expected, 'hex')
    const b = Buffer.from(provided, 'hex')
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

const ACTION_MAP: Record<string, { resourceType: WebhookResourceType; action: WebhookAction }> = {
  'document.sent': { resourceType: 'envelopes', action: 'sent' },
  'document.viewed': { resourceType: 'envelopes', action: 'viewed' },
  'document.signed': { resourceType: 'signers', action: 'signed' },
  'document.executed': { resourceType: 'envelopes', action: 'completed' },
  'document.completed': { resourceType: 'envelopes', action: 'completed' },
  'document.declined': { resourceType: 'envelopes', action: 'declined' },
  'document.voided': { resourceType: 'envelopes', action: 'voided' },
  'document.cancelled': { resourceType: 'envelopes', action: 'voided' },
  'document.expired': { resourceType: 'envelopes', action: 'expired' },
  'document.created': { resourceType: 'envelopes', action: 'created' },
  'reusable_form.created': { resourceType: 'templates', action: 'created' },
  'reusable_form.updated': { resourceType: 'templates', action: 'updated' },
}

export function parseRightSignatureWebhookEvents(
  payload: Record<string, unknown>,
): WebhookEvent[] {
  const eventType =
    (typeof payload['event'] === 'string' && (payload['event'] as string)) ||
    (typeof payload['event_type'] === 'string' && (payload['event_type'] as string)) ||
    (typeof payload['type'] === 'string' && (payload['type'] as string)) ||
    ''
  const data =
    (payload['data'] as Record<string, unknown> | undefined) ??
    (payload['document'] as Record<string, unknown> | undefined) ??
    {}
  const envelopeId = String(
    data['id'] ?? data['document_id'] ?? payload['document_id'] ?? '',
  )
  const signerId = String(data['signer_id'] ?? data['recipient_id'] ?? '')
  const templateId = String(data['template_id'] ?? data['reusable_form_id'] ?? '')
  const classified = ACTION_MAP[eventType.toLowerCase()] ?? {
    resourceType: 'unknown' as WebhookResourceType,
    action: 'unknown' as WebhookAction,
  }
  const resourceId =
    classified.resourceType === 'signers'
      ? signerId || envelopeId
      : classified.resourceType === 'templates'
        ? templateId
        : envelopeId
  return [
    {
      id: `rightsignature:${eventType}:${envelopeId}:${signerId}:${String(payload['timestamp'] ?? '')}`,
      platform: 'rightsignature',
      type: eventType,
      resourceType: classified.resourceType,
      action: classified.action,
      resourceId,
      envelopeId: envelopeId || undefined,
      payload,
    },
  ]
}

export const RightSignatureWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyRightSignatureWebhook,
  parseWebhookEvents: parseRightSignatureWebhookEvents,
}
