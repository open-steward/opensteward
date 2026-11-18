import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type { WebhookAction, WebhookEvent, WebhookResourceType } from '../../schema/webhook'

const SIG_HEADERS = ['x-cloudsign-signature', 'X-CloudSign-Signature']

export function verifyCloudSignWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const expected = createHmac('sha256', secret).update(payload).digest('hex')
    const expectedBuf = Buffer.from(expected, 'utf8')
    for (const name of SIG_HEADERS) {
      const provided = headers[name] ?? headers[name.toLowerCase()]
      if (!provided) continue
      const providedBuf = Buffer.from(provided.trim(), 'utf8')
      if (providedBuf.length !== expectedBuf.length) continue
      if (timingSafeEqual(providedBuf, expectedBuf)) return true
    }
    return false
  } catch {
    return false
  }
}

const ACTION_MAP: Record<string, { resourceType: WebhookResourceType; action: WebhookAction }> = {
  'document.created': { resourceType: 'envelopes', action: 'created' },
  'document.sent': { resourceType: 'envelopes', action: 'sent' },
  'document.viewed': { resourceType: 'envelopes', action: 'viewed' },
  'document.signed': { resourceType: 'envelopes', action: 'completed' },
  'document.completed': { resourceType: 'envelopes', action: 'completed' },
  'document.declined': { resourceType: 'envelopes', action: 'declined' },
  'document.cancelled': { resourceType: 'envelopes', action: 'voided' },
  'document.expired': { resourceType: 'envelopes', action: 'expired' },
  'participant.signed': { resourceType: 'signers', action: 'signed' },
  'participant.declined': { resourceType: 'signers', action: 'declined' },
}

export function parseCloudSignWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const event = String(payload['event'] ?? '')
  const data = (payload['data'] as Record<string, unknown> | undefined) ?? {}
  const envelopeId = String((data['document'] as Record<string, unknown> | undefined)?.['id'] ?? data['id'] ?? '')
  const signerId = String((data['participant'] as Record<string, unknown> | undefined)?.['id'] ?? '')
  const { resourceType, action } = ACTION_MAP[event] ?? {
    resourceType: 'unknown' as WebhookResourceType,
    action: 'unknown' as WebhookAction,
  }
  return [
    {
      id: `cloudsign:${event}:${envelopeId}:${signerId}`,
      platform: 'cloudsign',
      type: event,
      resourceType,
      action,
      resourceId: resourceType === 'signers' ? signerId || envelopeId : envelopeId,
      envelopeId: envelopeId || undefined,
      payload,
    },
  ]
}

export const CloudSignWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyCloudSignWebhook,
  parseWebhookEvents: parseCloudSignWebhookEvents,
}
