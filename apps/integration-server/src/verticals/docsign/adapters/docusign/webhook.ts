/**
 * DocuSign Connect webhook verification + event parsing.
 *
 * DocuSign Connect can deliver JSON or XML. We require JSON (XML support
 * is opt-in via Connect config and rarely used by modern integrations).
 * Connect signs deliveries with an HMAC-SHA256 of the raw body using the
 * Connect Secret. The signature ships as `X-DocuSign-Signature-1` (or
 * -2, -3 for key rotation). Compare base64-decoded with `timingSafeEqual`.
 *
 * Docs: https://developers.docusign.com/platform/webhooks/connect-hmac/
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type {
  WebhookAction,
  WebhookEvent,
  WebhookResourceType,
} from '../../schema/webhook'

const SIG_HEADER_PREFIX = 'x-docusign-signature-'

export function verifyDocuSignWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const expected = createHmac('sha256', secret).update(payload).digest()
    for (const [k, v] of Object.entries(headers)) {
      if (!k.toLowerCase().startsWith(SIG_HEADER_PREFIX)) continue
      const provided = Buffer.from(v, 'base64')
      if (provided.length !== expected.length) continue
      if (timingSafeEqual(provided, expected)) return true
    }
    return false
  } catch {
    return false
  }
}

const ACTION_MAP: Record<string, WebhookAction> = {
  'envelope-sent': 'sent',
  'envelope-delivered': 'delivered',
  'envelope-completed': 'completed',
  'envelope-declined': 'declined',
  'envelope-voided': 'voided',
  'envelope-corrected': 'updated',
  'envelope-purge': 'deleted',
  'recipient-sent': 'sent',
  'recipient-delivered': 'delivered',
  'recipient-completed': 'signed',
  'recipient-declined': 'declined',
  'recipient-authenticationfailed': 'updated',
  'recipient-autoresponded': 'updated',
  'template-created': 'created',
  'template-modified': 'updated',
  'template-deleted': 'deleted',
}

function classify(event: string): {
  resourceType: WebhookResourceType
  action: WebhookAction
} {
  const lowered = event.toLowerCase()
  if (lowered.startsWith('envelope-')) {
    return { resourceType: 'envelopes', action: ACTION_MAP[lowered] ?? 'updated' }
  }
  if (lowered.startsWith('recipient-')) {
    return { resourceType: 'signers', action: ACTION_MAP[lowered] ?? 'updated' }
  }
  if (lowered.startsWith('template-')) {
    return { resourceType: 'templates', action: ACTION_MAP[lowered] ?? 'updated' }
  }
  return { resourceType: 'unknown', action: 'unknown' }
}

export function parseDocuSignWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const event = String(payload['event'] ?? '')
  const generatedDateTime = String(payload['generatedDateTime'] ?? '')
  const data = (payload['data'] as Record<string, unknown> | undefined) ?? {}
  const envelopeId = String(data['envelopeId'] ?? '')
  const recipientId = String(data['recipientId'] ?? '')
  const templateId = String(data['templateId'] ?? '')
  const { resourceType, action } = classify(event)
  const resourceId =
    resourceType === 'signers'
      ? recipientId || envelopeId
      : resourceType === 'templates'
        ? templateId
        : envelopeId
  return [
    {
      id: `docusign:${event}:${envelopeId}:${recipientId}:${generatedDateTime}`,
      platform: 'docusign',
      type: event,
      resourceType,
      action,
      resourceId,
      envelopeId: envelopeId || undefined,
      payload,
    },
  ]
}

export const DocuSignWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyDocuSignWebhook,
  parseWebhookEvents: parseDocuSignWebhookEvents,
}
