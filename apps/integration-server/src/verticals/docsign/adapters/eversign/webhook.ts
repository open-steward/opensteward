/**
 * eversign webhook verification + event parsing.
 *
 * eversign signs deliveries with HMAC-SHA256 of the raw body using the
 * per-account webhook secret. Some eversign accounts ship the signature
 * in the `X-Eversign-Signature` header (hex). Older / SDK-style accounts
 * embed it in the JSON body as `meta.signature`. The verifier accepts
 * either source.
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type {
  WebhookAction,
  WebhookEvent,
  WebhookResourceType,
} from '../../schema/webhook'

const SIG_HEADERS = ['x-eversign-signature']

function pickHeaderSignature(headers: Record<string, string>): string | undefined {
  for (const [k, v] of Object.entries(headers)) {
    if (SIG_HEADERS.includes(k.toLowerCase())) {
      return v.startsWith('sha256=') ? v.slice('sha256='.length) : v
    }
  }
  return undefined
}

function pickBodySignature(payload: Buffer): string | undefined {
  try {
    const body = JSON.parse(payload.toString('utf8')) as {
      meta?: { signature?: string }
      signature?: string
    }
    return body.meta?.signature ?? body.signature
  } catch {
    return undefined
  }
}

export function verifyEversignWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const provided = pickHeaderSignature(headers) ?? pickBodySignature(payload)
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
  document_sent: { resourceType: 'envelopes', action: 'sent' },
  document_completed: { resourceType: 'envelopes', action: 'completed' },
  document_signed: { resourceType: 'signers', action: 'signed' },
  document_declined: { resourceType: 'envelopes', action: 'declined' },
  document_voided: { resourceType: 'envelopes', action: 'voided' },
  document_cancelled: { resourceType: 'envelopes', action: 'voided' },
  document_expired: { resourceType: 'envelopes', action: 'expired' },
  document_viewed: { resourceType: 'envelopes', action: 'viewed' },
  document_created: { resourceType: 'envelopes', action: 'created' },
  template_created: { resourceType: 'templates', action: 'created' },
  template_updated: { resourceType: 'templates', action: 'updated' },
}

export function parseEversignWebhookEvents(
  payload: Record<string, unknown>,
): WebhookEvent[] {
  const eventType =
    (typeof payload['event_type'] === 'string' && (payload['event_type'] as string)) ||
    (typeof payload['event'] === 'string' && (payload['event'] as string)) ||
    (typeof payload['type'] === 'string' && (payload['type'] as string)) ||
    ''
  const data =
    (payload['data'] as Record<string, unknown> | undefined) ??
    (payload['document'] as Record<string, unknown> | undefined) ??
    {}
  const envelopeId = String(
    data['document_hash'] ?? data['documentHash'] ?? payload['document_hash'] ?? '',
  )
  const signerId = String(data['signer_id'] ?? '')
  const templateId = String(data['template_id'] ?? '')
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
      id: `eversign:${eventType}:${envelopeId}:${signerId}:${String(payload['event_time'] ?? '')}`,
      platform: 'eversign',
      type: eventType,
      resourceType: classified.resourceType,
      action: classified.action,
      resourceId,
      envelopeId: envelopeId || undefined,
      payload,
    },
  ]
}

export const EversignWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyEversignWebhook,
  parseWebhookEvents: parseEversignWebhookEvents,
}
