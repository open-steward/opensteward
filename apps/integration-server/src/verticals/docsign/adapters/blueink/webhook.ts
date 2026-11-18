/**
 * Blueink webhook verification + event parsing.
 *
 * Blueink signs each delivery with an HMAC-SHA256 over the base string
 * `v0:{timestamp}:{rawBody}`, keyed by the webhook secret. The resulting
 * hex digest is prefixed with `v0=` before it is placed in the
 * `x-blueink-signature` header (i.e. the header value is `v0=<hexdigest>`).
 * We reconstruct the full `v0=<hexdigest>` string and compare it against
 * the header with `timingSafeEqual`.
 *
 * The JSON body carries `event_id`, `event_type`, `event_date`, `account_id`,
 * and a `payload` object with `bundle_id` (+ `packet_id` for packet events).
 *
 * Docs: https://developer.blueink.com/docs/esignature-api/webhook/
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type {
  WebhookAction,
  WebhookEvent,
  WebhookResourceType,
} from '../../schema/webhook'

const SIG_HEADER = 'x-blueink-signature'
const TIMESTAMP_HEADER = 'x-blueink-request-timestamp'

interface BlueinkEventBody {
  event_id?: string
  event_type?: string
  event_date?: string
  account_id?: string
  payload?: {
    bundle_id?: string
    packet_id?: string
    [key: string]: unknown
  }
}

export function verifyBlueinkWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const provided = headers[SIG_HEADER] ?? headers[SIG_HEADER.toLowerCase()]
    const timestamp = headers[TIMESTAMP_HEADER] ?? headers[TIMESTAMP_HEADER.toLowerCase()]
    if (!provided || !timestamp) return false
    const base = `v0:${timestamp}:${payload.toString('utf8')}`
    const hexDigest = createHmac('sha256', secret).update(base, 'utf8').digest('hex')
    const expected = `v0=${hexDigest}`
    const expectedBuf = Buffer.from(expected, 'utf8')
    const providedBuf = Buffer.from(provided, 'utf8')
    if (expectedBuf.length !== providedBuf.length) return false
    return timingSafeEqual(expectedBuf, providedBuf)
  } catch {
    return false
  }
}

const ACTION_MAP: Record<string, { resourceType: WebhookResourceType; action: WebhookAction }> = {
  bundle_sent: { resourceType: 'envelopes', action: 'sent' },
  bundle_complete: { resourceType: 'envelopes', action: 'completed' },
  bundle_docs_ready: { resourceType: 'envelopes', action: 'updated' },
  bundle_error: { resourceType: 'envelopes', action: 'updated' },
  bundle_cancelled: { resourceType: 'envelopes', action: 'voided' },
  packet_viewed: { resourceType: 'signers', action: 'viewed' },
  packet_complete: { resourceType: 'signers', action: 'signed' },
  packet_declined: { resourceType: 'signers', action: 'declined' },
}

export function parseBlueinkWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const body = payload as BlueinkEventBody
  const eventType = body.event_type ?? ''
  const { resourceType, action } = ACTION_MAP[eventType] ?? {
    resourceType: 'unknown' as WebhookResourceType,
    action: 'unknown' as WebhookAction,
  }
  const bundleId = body.payload?.bundle_id ?? ''
  const packetId = body.payload?.packet_id ?? ''
  const resourceId = resourceType === 'signers' ? packetId || bundleId : bundleId
  return [
    {
      id: `blueink:${eventType}:${bundleId}:${packetId}:${body.event_id ?? body.event_date ?? ''}`,
      platform: 'blueink',
      type: eventType || 'unknown',
      resourceType,
      action,
      resourceId,
      envelopeId: bundleId || undefined,
      payload,
    },
  ]
}

export const BlueinkWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyBlueinkWebhook,
  parseWebhookEvents: parseBlueinkWebhookEvents,
}
