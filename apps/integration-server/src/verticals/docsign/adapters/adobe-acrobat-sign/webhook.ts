/**
 * Adobe Acrobat Sign webhook verification + parsing.
 *
 * Adobe Sign signs webhooks with HMAC-SHA256 using the client secret. The
 * signature ships as `X-AdobeSign-ClientId` (the client id, for sender
 * identification) + `X-AdobeSign-ClientSecret` (the HMAC). On webhook
 * registration Adobe Sign requires the URL to respond to a verification
 * GET; the same secret is used.
 *
 * Docs: https://opensource.adobe.com/acrobat-sign/developer_guide/webhooks.html
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type {
  WebhookAction,
  WebhookEvent,
  WebhookResourceType,
} from '../../schema/webhook'

export function verifyAdobeAcrobatSignWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const provided = headers['x-adobesign-clientsecret'] ?? headers['X-AdobeSign-ClientSecret']
    if (!provided) return false
    const expected = createHmac('sha256', secret).update(payload).digest('base64')
    const a = Buffer.from(provided)
    const b = Buffer.from(expected)
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

const ACTION_MAP: Record<string, { resourceType: WebhookResourceType; action: WebhookAction }> = {
  AGREEMENT_CREATED: { resourceType: 'envelopes', action: 'created' },
  AGREEMENT_ACTION_REQUESTED: { resourceType: 'envelopes', action: 'sent' },
  AGREEMENT_RECALLED: { resourceType: 'envelopes', action: 'voided' },
  AGREEMENT_REJECTED: { resourceType: 'envelopes', action: 'declined' },
  AGREEMENT_EXPIRED: { resourceType: 'envelopes', action: 'expired' },
  AGREEMENT_DELEGATED: { resourceType: 'signers', action: 'updated' },
  AGREEMENT_ACTION_COMPLETED: { resourceType: 'signers', action: 'signed' },
  AGREEMENT_WORKFLOW_COMPLETED: { resourceType: 'envelopes', action: 'completed' },
  AGREEMENT_MODIFIED: { resourceType: 'envelopes', action: 'updated' },
  AGREEMENT_USER_ACK_AGREEMENT_MODIFIED: { resourceType: 'envelopes', action: 'updated' },
  AGREEMENT_VAULTED: { resourceType: 'envelopes', action: 'updated' },
  AGREEMENT_EMAIL_VIEWED: { resourceType: 'envelopes', action: 'viewed' },
  AGREEMENT_EMAIL_BOUNCED: { resourceType: 'envelopes', action: 'updated' },
  AGREEMENT_AUTO_CANCELLED_CONVERSION_PROBLEM: {
    resourceType: 'envelopes',
    action: 'voided',
  },
  AGREEMENT_OFFLINE_SYNC: { resourceType: 'envelopes', action: 'updated' },
}

export function parseAdobeAcrobatSignWebhookEvents(
  payload: Record<string, unknown>,
): WebhookEvent[] {
  const event = String(payload['event'] ?? '')
  const agreement = (payload['agreement'] as Record<string, unknown>) ?? {}
  const envelopeId = String(agreement['id'] ?? '')
  const { resourceType, action } = ACTION_MAP[event] ?? {
    resourceType: 'unknown' as WebhookResourceType,
    action: 'unknown' as WebhookAction,
  }
  return [
    {
      id: `adobe-acrobat-sign:${event}:${envelopeId}:${payload['eventDate'] ?? ''}`,
      platform: 'adobe-acrobat-sign',
      type: event,
      resourceType,
      action,
      resourceId: envelopeId,
      envelopeId: envelopeId || undefined,
      payload,
    },
  ]
}

export const AdobeAcrobatSignWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyAdobeAcrobatSignWebhook,
  parseWebhookEvents: parseAdobeAcrobatSignWebhookEvents,
}
