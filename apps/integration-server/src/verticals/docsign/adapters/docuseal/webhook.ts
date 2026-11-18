/**
 * DocuSeal webhook verification + event parsing.
 *
 * DocuSeal signs outgoing webhook deliveries with an HMAC-SHA256 signature
 * sent in the `X-Docuseal-Signature` header, computed over the raw request
 * body using the signing secret (`whsec_...`) from the console's
 * Security → HMAC tab. Some deployments emit a versioned form
 * `<timestamp>.<hexSignature>` where the signed content is
 * `<timestamp>.<rawBody>`; others emit a bare hex digest of the raw body.
 * The verifier accepts either and compares with `timingSafeEqual`.
 *
 * Verification MUST run against the exact bytes received on the wire — a
 * re-serialised JSON body will not match.
 *
 * Docs: https://www.docuseal.com/resources/use-webhooks
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type {
  WebhookAction,
  WebhookEvent,
  WebhookResourceType,
} from '../../schema/webhook'
import { SIGNATURE_HEADER } from './constants'

function safeEqualHex(a: string, b: string): boolean {
  if (!a || !b) return false
  try {
    const bufA = Buffer.from(a, 'hex')
    const bufB = Buffer.from(b, 'hex')
    if (bufA.length === 0 || bufA.length !== bufB.length) return false
    return timingSafeEqual(bufA, bufB)
  } catch {
    return false
  }
}

export function verifyDocusealWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const headerValue =
      headers[SIGNATURE_HEADER] ?? headers[SIGNATURE_HEADER.toLowerCase()] ?? ''
    if (!headerValue || !secret) return false

    // Versioned form: "<timestamp>.<signature>" signing "<timestamp>.<body>".
    const dotIndex = headerValue.indexOf('.')
    if (dotIndex > 0) {
      const timestamp = headerValue.slice(0, dotIndex)
      const provided = headerValue.slice(dotIndex + 1)
      const expected = createHmac('sha256', secret)
        .update(`${timestamp}.`)
        .update(payload)
        .digest('hex')
      if (safeEqualHex(provided, expected)) return true
    }

    // Bare form: hex digest of the raw body.
    const expectedBare = createHmac('sha256', secret).update(payload).digest('hex')
    return safeEqualHex(headerValue, expectedBare)
  } catch {
    return false
  }
}

const ACTION_MAP: Record<string, { resourceType: WebhookResourceType; action: WebhookAction }> = {
  'form.viewed': { resourceType: 'signers', action: 'viewed' },
  'form.started': { resourceType: 'signers', action: 'viewed' },
  'form.completed': { resourceType: 'signers', action: 'signed' },
  'form.declined': { resourceType: 'signers', action: 'declined' },
  'submission.created': { resourceType: 'envelopes', action: 'created' },
  'submission.completed': { resourceType: 'envelopes', action: 'completed' },
  'submission.expired': { resourceType: 'envelopes', action: 'expired' },
  'submission.archived': { resourceType: 'envelopes', action: 'deleted' },
  'template.created': { resourceType: 'templates', action: 'created' },
  'template.updated': { resourceType: 'templates', action: 'updated' },
}

function classify(eventType: string): {
  resourceType: WebhookResourceType
  action: WebhookAction
} {
  const mapped = ACTION_MAP[eventType]
  if (mapped) return mapped
  if (eventType.startsWith('form.')) return { resourceType: 'signers', action: 'updated' }
  if (eventType.startsWith('submission.')) return { resourceType: 'envelopes', action: 'updated' }
  if (eventType.startsWith('template.')) return { resourceType: 'templates', action: 'updated' }
  return { resourceType: 'unknown', action: 'unknown' }
}

export function parseDocusealWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const eventType = String(payload['event_type'] ?? '')
  const timestamp = String(payload['timestamp'] ?? '')
  const data = (payload['data'] as Record<string, unknown> | undefined) ?? {}
  const { resourceType, action } = classify(eventType)

  // `form.*` payloads carry the submitter object directly; the parent
  // submission id lives on `submission_id`. `submission.*` payloads carry the
  // submission object directly. `template.*` payloads carry the template.
  const submissionId =
    resourceType === 'envelopes'
      ? String(data['id'] ?? '')
      : String(data['submission_id'] ?? (data['submission'] as Record<string, unknown> | undefined)?.['id'] ?? '')
  const templateId = resourceType === 'templates' ? String(data['id'] ?? '') : ''
  const submitterId = resourceType === 'signers' ? String(data['id'] ?? '') : ''

  const resourceId =
    resourceType === 'templates'
      ? templateId
      : resourceType === 'signers'
        ? submitterId || submissionId
        : submissionId

  return [
    {
      id: `docuseal:${eventType}:${resourceId}:${timestamp}`,
      platform: 'docuseal',
      type: eventType,
      resourceType,
      action,
      resourceId,
      envelopeId: submissionId || undefined,
      payload,
    },
  ]
}

export const DocusealWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyDocusealWebhook,
  parseWebhookEvents: parseDocusealWebhookEvents,
}
