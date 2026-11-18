import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type { WebhookAction, WebhookEvent, WebhookResourceType } from '../../schema/webhook'

const SIG_HEADERS = ['x-visma-signature', 'X-Visma-Signature']

export function verifyVismaSignWebhook(
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
  'document.cancelled': { resourceType: 'envelopes', action: 'voided' },
  'document.expired': { resourceType: 'envelopes', action: 'expired' },
  'invitation.signed': { resourceType: 'signers', action: 'signed' },
  'invitation.declined': { resourceType: 'signers', action: 'declined' },
}

export function parseVismaSignWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const event = String(payload['event'] ?? '')
  const data = (payload['data'] as Record<string, unknown> | undefined) ?? {}
  const envelopeId = String(
    (data['document'] as Record<string, unknown> | undefined)?.['uuid'] ?? data['uuid'] ?? '',
  )
  const signerId = String((data['invitation'] as Record<string, unknown> | undefined)?.['uuid'] ?? '')
  const { resourceType, action } = ACTION_MAP[event] ?? {
    resourceType: 'unknown' as WebhookResourceType,
    action: 'unknown' as WebhookAction,
  }
  return [
    {
      id: `visma-sign:${event}:${envelopeId}:${signerId}`,
      platform: 'visma-sign',
      type: event,
      resourceType,
      action,
      resourceId: resourceType === 'signers' ? signerId || envelopeId : envelopeId,
      envelopeId: envelopeId || undefined,
      payload,
    },
  ]
}

export const VismaSignWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyVismaSignWebhook,
  parseWebhookEvents: parseVismaSignWebhookEvents,
}
