import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type { WebhookAction, WebhookEvent, WebhookResourceType } from '../../schema/webhook'

const SIG_HEADERS = ['x-emsigner-signature', 'X-Emsigner-Signature']

export function verifyEmSignerWebhook(
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
  'envelope.created': { resourceType: 'envelopes', action: 'created' },
  'envelope.sent': { resourceType: 'envelopes', action: 'sent' },
  'envelope.viewed': { resourceType: 'envelopes', action: 'viewed' },
  'envelope.completed': { resourceType: 'envelopes', action: 'completed' },
  'envelope.signed': { resourceType: 'envelopes', action: 'completed' },
  'envelope.declined': { resourceType: 'envelopes', action: 'declined' },
  'envelope.cancelled': { resourceType: 'envelopes', action: 'voided' },
  'envelope.expired': { resourceType: 'envelopes', action: 'expired' },
  'signer.signed': { resourceType: 'signers', action: 'signed' },
  'signer.declined': { resourceType: 'signers', action: 'declined' },
}

export function parseEmSignerWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const event = String(payload['event'] ?? '')
  const data = (payload['data'] as Record<string, unknown> | undefined) ?? {}
  const envelopeId = String(
    (data['envelope'] as Record<string, unknown> | undefined)?.['envelopeId'] ??
      data['envelopeId'] ??
      '',
  )
  const signerId = String((data['signer'] as Record<string, unknown> | undefined)?.['id'] ?? '')
  const { resourceType, action } = ACTION_MAP[event] ?? {
    resourceType: 'unknown' as WebhookResourceType,
    action: 'unknown' as WebhookAction,
  }
  return [
    {
      id: `emsigner:${event}:${envelopeId}:${signerId}`,
      platform: 'emsigner',
      type: event,
      resourceType,
      action,
      resourceId: resourceType === 'signers' ? signerId || envelopeId : envelopeId,
      envelopeId: envelopeId || undefined,
      payload,
    },
  ]
}

export const EmSignerWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyEmSignerWebhook,
  parseWebhookEvents: parseEmSignerWebhookEvents,
}
