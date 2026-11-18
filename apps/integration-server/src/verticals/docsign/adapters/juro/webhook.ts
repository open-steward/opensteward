/**
 * Juro webhook verification + event parsing.
 *
 * Juro signs deliveries with an HMAC-SHA256 of the raw body using the
 * shared secret configured on the webhook. The signature ships in the
 * `signature` header formatted as `sha256 <hex-digest>`.
 *
 * Docs: https://api-docs.juro.com/ (Settings → Integrations → Webhooks)
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type {
  WebhookAction,
  WebhookEvent,
  WebhookResourceType,
} from '../../schema/webhook'

const SIG_HEADERS = ['signature', 'x-juro-signature']

export function verifyJuroWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const expected = createHmac('sha256', secret).update(payload).digest('hex')
    const expectedBuf = Buffer.from(expected, 'utf8')
    for (const name of SIG_HEADERS) {
      const raw = headers[name] ?? headers[name.toLowerCase()]
      if (!raw) continue
      // Juro sends `sha256 <hex>`; tolerate a bare hex digest too.
      const provided = raw.trim().replace(/^sha256[ =]?/i, '').trim()
      const providedBuf = Buffer.from(provided, 'utf8')
      if (providedBuf.length !== expectedBuf.length) continue
      if (timingSafeEqual(providedBuf, expectedBuf)) return true
    }
    return false
  } catch {
    return false
  }
}

const ACTION_MAP: Record<string, WebhookAction> = {
  'contract.created': 'created',
  'contract.deleted': 'deleted',
  'contract.edit': 'updated',
  'contract.commented': 'updated',
  'contract.viewed': 'viewed',
  'contract.pdf_generated': 'updated',
  'contract.sent_link_to_counterparty': 'sent',
  'contract.signed': 'signed',
  'contract.approval_requested': 'sent',
  'contract.approval_in_progress': 'sent',
  'contract.approval_process_finished': 'completed',
  'contract.approval_denied': 'declined',
  'contract.approval_request_cancelled': 'voided',
}

export function parseJuroWebhookEvents(
  payload: Record<string, unknown>,
): WebhookEvent[] {
  const event = String(payload['event'] ?? payload['type'] ?? '')
  const data =
    (payload['data'] as Record<string, unknown> | undefined) ??
    (payload['contract'] as Record<string, unknown> | undefined) ??
    payload
  const contractId = String(
    (data['contract'] as Record<string, unknown> | undefined)?.['id'] ??
      data['contractId'] ??
      data['id'] ??
      payload['contractId'] ??
      '',
  )
  const action: WebhookAction = ACTION_MAP[event] ?? 'unknown'
  const resourceType: WebhookResourceType = event.startsWith('contract.')
    ? 'envelopes'
    : 'unknown'
  return [
    {
      id: `juro:${event}:${contractId}`,
      platform: 'juro',
      type: event || 'unknown',
      resourceType,
      action,
      resourceId: contractId,
      envelopeId: contractId || undefined,
      payload,
    },
  ]
}

export const JuroWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyJuroWebhook,
  parseWebhookEvents: parseJuroWebhookEvents,
}
