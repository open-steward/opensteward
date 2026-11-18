/**
 * BoldSign webhook verification + event parsing.
 *
 * BoldSign signs each delivery with an HMAC-SHA256 over `${t}.${rawBody}`
 * using the webhook signing secret, where `t` is the event epoch timestamp.
 * The signature ships in the `x-boldsign-signature` header as a
 * comma-separated list: `t=<epoch>, s0=<hex>, s1=<hex>` — `s1` carries the
 * previous key during a secret rotation. We accept a match against any `sN`.
 *
 * The JSON body nests the event metadata under `event` (with `eventType`)
 * and the resource under `data` (with `documentId` / template fields).
 *
 * Docs: https://developers.boldsign.com/webhooks/verify-webhook-events/
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type {
  WebhookAction,
  WebhookEvent,
  WebhookResourceType,
} from '../../schema/webhook'

const SIG_HEADER = 'x-boldsign-signature'

interface ParsedSignature {
  timestamp: string
  signatures: string[]
}

function parseSignatureHeader(value: string): ParsedSignature | undefined {
  let timestamp = ''
  const signatures: string[] = []
  for (const part of value.split(',')) {
    const [k, v] = part.split('=').map((s) => s.trim())
    if (!k || !v) continue
    if (k === 't') timestamp = v
    else if (/^s\d+$/.test(k)) signatures.push(v)
  }
  if (!timestamp || signatures.length === 0) return undefined
  return { timestamp, signatures }
}

export function verifyBoldsignWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const headerValue = headers[SIG_HEADER] ?? headers[SIG_HEADER.toLowerCase()]
    if (!headerValue) return false
    const parsed = parseSignatureHeader(headerValue)
    if (!parsed) return false
    const signedPayload = `${parsed.timestamp}.${payload.toString('utf8')}`
    const expected = createHmac('sha256', secret).update(signedPayload, 'utf8').digest('hex')
    const expectedBuf = Buffer.from(expected, 'utf8')
    for (const provided of parsed.signatures) {
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
  sent: 'sent',
  signed: 'signed',
  completed: 'completed',
  declined: 'declined',
  revoked: 'voided',
  expired: 'expired',
  viewed: 'viewed',
  reassigned: 'updated',
  reminder: 'updated',
  authenticationfailed: 'updated',
  deliveryfailed: 'updated',
  sendfailed: 'updated',
  draftcreated: 'created',
  signersaved: 'updated',
  edited: 'updated',
  editfailed: 'updated',
  templatecreated: 'created',
  templateedited: 'updated',
  templatedraftcreated: 'created',
  templatecreatefailed: 'updated',
  templatesendfailed: 'updated',
}

function classify(eventType: string): {
  resourceType: WebhookResourceType
  action: WebhookAction
} {
  const lower = eventType.toLowerCase()
  const action = ACTION_MAP[lower] ?? 'updated'
  if (lower.startsWith('template')) {
    return { resourceType: 'templates', action }
  }
  if (lower.startsWith('senderidentity') || lower.startsWith('identityverification')) {
    return { resourceType: 'unknown', action }
  }
  return { resourceType: 'envelopes', action }
}

export function parseBoldsignWebhookEvents(
  payload: Record<string, unknown>,
): WebhookEvent[] {
  const event = (payload['event'] as Record<string, unknown> | undefined) ?? {}
  const data = (payload['data'] as Record<string, unknown> | undefined) ?? {}
  const eventType = String(event['eventType'] ?? '')
  const created = String(event['created'] ?? '')
  const documentId = String(data['documentId'] ?? '')
  const templateId = String(data['templateId'] ?? '')
  const { resourceType, action } = classify(eventType)
  const resourceId = resourceType === 'templates' ? templateId || documentId : documentId
  return [
    {
      id: `boldsign:${eventType}:${resourceId}:${created}`,
      platform: 'boldsign',
      type: eventType || 'unknown',
      resourceType,
      action,
      resourceId,
      envelopeId: documentId || undefined,
      payload,
    },
  ]
}

export const BoldsignWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyBoldsignWebhook,
  parseWebhookEvents: parseBoldsignWebhookEvents,
}
