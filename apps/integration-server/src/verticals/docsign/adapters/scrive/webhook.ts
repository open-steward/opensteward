import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type { WebhookAction, WebhookEvent, WebhookResourceType } from '../../schema/webhook'

const SIG_HEADERS = ['x-scrive-signature', 'X-Scrive-Signature']

export function verifyScriveWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const expected = createHmac('sha256', secret).update(payload).digest('hex')
    const a = Buffer.from(expected, 'utf8')
    for (const name of SIG_HEADERS) {
      const provided = headers[name] ?? headers[name.toLowerCase()]
      if (!provided) continue
      const b = Buffer.from(provided.trim(), 'utf8')
      if (a.length !== b.length) continue
      if (timingSafeEqual(a, b)) return true
    }
    return false
  } catch {
    return false
  }
}

const ACTION_MAP: Record<string, { resourceType: WebhookResourceType; action: WebhookAction }> = {
  'document.prepared': { resourceType: 'envelopes', action: 'created' },
  'document.sent': { resourceType: 'envelopes', action: 'sent' },
  'document.viewed': { resourceType: 'envelopes', action: 'viewed' },
  'document.closed': { resourceType: 'envelopes', action: 'completed' },
  'document.signed': { resourceType: 'envelopes', action: 'completed' },
  'document.rejected': { resourceType: 'envelopes', action: 'declined' },
  'document.canceled': { resourceType: 'envelopes', action: 'voided' },
  'document.timedout': { resourceType: 'envelopes', action: 'expired' },
  'party.signed': { resourceType: 'signers', action: 'signed' },
  'party.rejected': { resourceType: 'signers', action: 'declined' },
}

export function parseScriveWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const event = String(payload['event'] ?? payload['type'] ?? '')
  const document = (payload['document'] as Record<string, unknown> | undefined) ?? {}
  const party = (payload['party'] as Record<string, unknown> | undefined) ?? {}
  const envelopeId = String(document['id'] ?? '')
  const signerId = String(party['id'] ?? '')
  const { resourceType, action } = ACTION_MAP[event] ?? {
    resourceType: 'unknown' as WebhookResourceType,
    action: 'unknown' as WebhookAction,
  }
  return [
    {
      id: `scrive:${event}:${envelopeId}:${signerId}`,
      platform: 'scrive',
      type: event,
      resourceType,
      action,
      resourceId: resourceType === 'signers' ? signerId || envelopeId : envelopeId,
      envelopeId: envelopeId || undefined,
      payload,
    },
  ]
}

export const ScriveWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyScriveWebhook,
  parseWebhookEvents: parseScriveWebhookEvents,
}
