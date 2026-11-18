import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type { WebhookAction, WebhookEvent, WebhookResourceType } from '../../schema/webhook'

const SIG_HEADERS = ['x-signeasy-signature', 'X-SignEasy-Signature']

export function verifySignEasyWebhook(
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
  'request.created': { resourceType: 'envelopes', action: 'created' },
  'request.sent': { resourceType: 'envelopes', action: 'sent' },
  'request.viewed': { resourceType: 'envelopes', action: 'viewed' },
  'request.signed': { resourceType: 'envelopes', action: 'completed' },
  'request.completed': { resourceType: 'envelopes', action: 'completed' },
  'request.declined': { resourceType: 'envelopes', action: 'declined' },
  'request.cancelled': { resourceType: 'envelopes', action: 'voided' },
  'request.expired': { resourceType: 'envelopes', action: 'expired' },
  'signer.signed': { resourceType: 'signers', action: 'signed' },
  'signer.declined': { resourceType: 'signers', action: 'declined' },
  'signer.viewed': { resourceType: 'signers', action: 'viewed' },
}

export function parseSignEasyWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const event = String(payload['event'] ?? '')
  const data = (payload['data'] as Record<string, unknown> | undefined) ?? {}
  const envelopeId = String(
    (data['request'] as Record<string, unknown> | undefined)?.['id'] ?? data['id'] ?? '',
  )
  const signerId = String((data['signer'] as Record<string, unknown> | undefined)?.['id'] ?? '')
  const { resourceType, action } = ACTION_MAP[event] ?? {
    resourceType: 'unknown' as WebhookResourceType,
    action: 'unknown' as WebhookAction,
  }
  return [
    {
      id: `signeasy:${event}:${envelopeId}:${signerId}`,
      platform: 'signeasy',
      type: event,
      resourceType,
      action,
      resourceId: resourceType === 'signers' ? signerId || envelopeId : envelopeId,
      envelopeId: envelopeId || undefined,
      payload,
    },
  ]
}

export const SignEasyWebhookHandler: WebhookHandler = {
  verifyWebhook: verifySignEasyWebhook,
  parseWebhookEvents: parseSignEasyWebhookEvents,
}
