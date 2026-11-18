import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type { WebhookAction, WebhookEvent, WebhookResourceType } from '../../schema/webhook'

const SIG_HEADERS = ['x-oneflow-signature', 'X-Oneflow-Signature']

export function verifyOneflowWebhook(
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
  'contract.created': { resourceType: 'envelopes', action: 'created' },
  'contract.published': { resourceType: 'envelopes', action: 'sent' },
  'contract.signed': { resourceType: 'envelopes', action: 'completed' },
  'contract.completed': { resourceType: 'envelopes', action: 'completed' },
  'contract.declined': { resourceType: 'envelopes', action: 'declined' },
  'contract.terminated': { resourceType: 'envelopes', action: 'voided' },
  'contract.cancelled': { resourceType: 'envelopes', action: 'voided' },
  'contract.expired': { resourceType: 'envelopes', action: 'expired' },
  'participant.signed': { resourceType: 'signers', action: 'signed' },
  'participant.declined': { resourceType: 'signers', action: 'declined' },
}

export function parseOneflowWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const event = String(payload['event'] ?? '')
  const data = (payload['data'] as Record<string, unknown> | undefined) ?? {}
  const envelopeId = String(
    (data['contract'] as Record<string, unknown> | undefined)?.['id'] ?? data['contract_id'] ?? '',
  )
  const signerId = String(
    (data['participant'] as Record<string, unknown> | undefined)?.['id'] ?? '',
  )
  const { resourceType, action } = ACTION_MAP[event] ?? {
    resourceType: 'unknown' as WebhookResourceType,
    action: 'unknown' as WebhookAction,
  }
  return [
    {
      id: `oneflow:${event}:${envelopeId}:${signerId}`,
      platform: 'oneflow',
      type: event,
      resourceType,
      action,
      resourceId: resourceType === 'signers' ? signerId || envelopeId : envelopeId,
      envelopeId: envelopeId || undefined,
      payload,
    },
  ]
}

export const OneflowWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyOneflowWebhook,
  parseWebhookEvents: parseOneflowWebhookEvents,
}
