import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type { WebhookAction, WebhookEvent, WebhookResourceType } from '../../schema/webhook'

const SIG_HEADERS = ['x-swisssign-signature', 'X-SwissSign-Signature']

export function verifySwissSignWebhook(
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
  'document.created': { resourceType: 'envelopes', action: 'created' },
  'document.sent': { resourceType: 'envelopes', action: 'sent' },
  'document.signed': { resourceType: 'envelopes', action: 'completed' },
  'document.completed': { resourceType: 'envelopes', action: 'completed' },
  'document.declined': { resourceType: 'envelopes', action: 'declined' },
  'document.cancelled': { resourceType: 'envelopes', action: 'voided' },
  'document.expired': { resourceType: 'envelopes', action: 'expired' },
  'signer.signed': { resourceType: 'signers', action: 'signed' },
  'signer.declined': { resourceType: 'signers', action: 'declined' },
}

export function parseSwissSignWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const event = String(payload['event'] ?? '')
  const data = (payload['data'] as Record<string, unknown> | undefined) ?? {}
  const envelopeId = String(
    (data['document'] as Record<string, unknown> | undefined)?.['id'] ?? data['id'] ?? '',
  )
  const signerId = String((data['signer'] as Record<string, unknown> | undefined)?.['id'] ?? '')
  const { resourceType, action } = ACTION_MAP[event] ?? {
    resourceType: 'unknown' as WebhookResourceType,
    action: 'unknown' as WebhookAction,
  }
  return [
    {
      id: `swisssign:${event}:${envelopeId}:${signerId}`,
      platform: 'swisssign',
      type: event,
      resourceType,
      action,
      resourceId: resourceType === 'signers' ? signerId || envelopeId : envelopeId,
      envelopeId: envelopeId || undefined,
      payload,
    },
  ]
}

export const SwissSignWebhookHandler: WebhookHandler = {
  verifyWebhook: verifySwissSignWebhook,
  parseWebhookEvents: parseSwissSignWebhookEvents,
}
