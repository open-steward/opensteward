/**
 * SignatureAPI webhook verification + event parsing.
 *
 * SignatureAPI signs webhook deliveries per the Standard Webhooks
 * specification (https://www.standardwebhooks.com). Three headers ship on
 * each delivery:
 *
 *   webhook-id         unique message id
 *   webhook-timestamp  unix seconds the message was sent
 *   webhook-signature  space-separated list of `v1,<base64sig>` versions
 *
 * The signed content is `${webhook-id}.${webhook-timestamp}.${rawBody}` and
 * the signature is base64(HMAC-SHA256(signedContent, key)), where `key` is the
 * base64-decoded bytes of the endpoint secret after its `whsec_` prefix. We
 * recompute and compare every offered `v1,` signature with `timingSafeEqual`.
 *
 * The JSON body is an Event object: `{ id, type, data: { envelope?,
 * recipient?, deliverable? } }`.
 *
 * Docs: https://signatureapi.com/docs/api/webhooks
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type {
  WebhookAction,
  WebhookEvent,
  WebhookResourceType,
} from '../../schema/webhook'

const ID_HEADER = 'webhook-id'
const TIMESTAMP_HEADER = 'webhook-timestamp'
const SIGNATURE_HEADER = 'webhook-signature'

interface SignatureapiEventBody {
  id?: string
  type?: string
  timestamp?: string
  data?: {
    envelope?: { id?: string }
    recipient?: { id?: string }
    deliverable?: { id?: string; envelope_id?: string }
    [key: string]: unknown
  }
}

function header(headers: Record<string, string>, name: string): string | undefined {
  return headers[name] ?? headers[name.toLowerCase()]
}

/** Decode the endpoint secret's key bytes; `whsec_<base64>` per Standard Webhooks. */
function secretKey(secret: string): Buffer {
  const raw = secret.startsWith('whsec_') ? secret.slice('whsec_'.length) : secret
  return Buffer.from(raw, 'base64')
}

export function verifySignatureapiWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const id = header(headers, ID_HEADER)
    const timestamp = header(headers, TIMESTAMP_HEADER)
    const sigHeader = header(headers, SIGNATURE_HEADER)
    if (!id || !timestamp || !sigHeader || !secret) return false

    const signedContent = `${id}.${timestamp}.${payload.toString('utf8')}`
    const expected = createHmac('sha256', secretKey(secret))
      .update(signedContent, 'utf8')
      .digest('base64')
    const expectedBuf = Buffer.from(expected, 'utf8')

    // The header is a space-separated list of `version,signature` pairs.
    for (const part of sigHeader.split(' ')) {
      const [version, sig] = part.split(',')
      if (version !== 'v1' || !sig) continue
      const providedBuf = Buffer.from(sig, 'utf8')
      if (
        providedBuf.length === expectedBuf.length &&
        timingSafeEqual(providedBuf, expectedBuf)
      ) {
        return true
      }
    }
    return false
  } catch {
    return false
  }
}

const ACTION_MAP: Record<string, { resourceType: WebhookResourceType; action: WebhookAction }> = {
  'envelope.created': { resourceType: 'envelopes', action: 'created' },
  'envelope.started': { resourceType: 'envelopes', action: 'sent' },
  'envelope.completed': { resourceType: 'envelopes', action: 'completed' },
  'envelope.canceled': { resourceType: 'envelopes', action: 'voided' },
  'envelope.cancelled': { resourceType: 'envelopes', action: 'voided' },
  'recipient.released': { resourceType: 'signers', action: 'sent' },
  'recipient.sent': { resourceType: 'signers', action: 'sent' },
  'recipient.accessed': { resourceType: 'signers', action: 'viewed' },
  'recipient.viewed': { resourceType: 'signers', action: 'viewed' },
  'recipient.completed': { resourceType: 'signers', action: 'signed' },
  'recipient.rejected': { resourceType: 'signers', action: 'declined' },
  'recipient.soft-bounced': { resourceType: 'signers', action: 'updated' },
  'recipient.hard-bounced': { resourceType: 'signers', action: 'updated' },
  'recipient.failed': { resourceType: 'signers', action: 'updated' },
  'deliverable.generated': { resourceType: 'documents', action: 'updated' },
}

export function parseSignatureapiWebhookEvents(
  payload: Record<string, unknown>,
): WebhookEvent[] {
  const body = payload as SignatureapiEventBody
  const eventType = body.type ?? ''
  const { resourceType, action } = ACTION_MAP[eventType] ?? {
    resourceType: 'unknown' as WebhookResourceType,
    action: 'unknown' as WebhookAction,
  }
  const envelopeId =
    body.data?.envelope?.id ?? body.data?.deliverable?.envelope_id ?? ''
  const recipientId = body.data?.recipient?.id ?? ''
  const deliverableId = body.data?.deliverable?.id ?? ''
  let resourceId = envelopeId
  if (resourceType === 'signers') resourceId = recipientId || envelopeId
  else if (resourceType === 'documents') resourceId = deliverableId || envelopeId
  return [
    {
      id: body.id ?? `signatureapi:${eventType}:${envelopeId}:${recipientId}`,
      platform: 'signatureapi',
      type: eventType || 'unknown',
      resourceType,
      action,
      resourceId,
      envelopeId: envelopeId || undefined,
      payload,
    },
  ]
}

export const SignatureapiWebhookHandler: WebhookHandler = {
  verifyWebhook: verifySignatureapiWebhook,
  parseWebhookEvents: parseSignatureapiWebhookEvents,
}
