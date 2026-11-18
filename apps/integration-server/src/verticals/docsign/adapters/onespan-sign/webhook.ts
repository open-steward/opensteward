/**
 * OneSpan Sign webhook verification + event parsing.
 *
 * OneSpan signs callbacks with an HMAC-SHA256 of the raw body using the
 * configured callback key. The signature header is `X-Esl-Signature` (hex).
 *
 * Docs: https://community.onespan.com/documentation/onespan-sign/guides/feature-guides/sender/event-notifier
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type {
  WebhookAction,
  WebhookEvent,
  WebhookResourceType,
} from '../../schema/webhook'

const SIG_HEADERS = ['x-esl-signature', 'x-onespan-signature']

export function verifyOneSpanSignWebhook(
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

const ACTION_MAP: Record<string, WebhookAction> = {
  PACKAGE_CREATE: 'created',
  PACKAGE_ACTIVATE: 'sent',
  PACKAGE_COMPLETE: 'completed',
  PACKAGE_DECLINE: 'declined',
  PACKAGE_OPT_OUT: 'declined',
  PACKAGE_EXPIRE: 'expired',
  PACKAGE_DEACTIVATE: 'voided',
  PACKAGE_TRASH: 'voided',
  PACKAGE_RESTORE: 'updated',
  PACKAGE_ARCHIVE: 'completed',
  PACKAGE_READY_FOR_COMPLETION: 'signed',
  SIGNER_COMPLETE: 'signed',
  SIGNER_DELIVERED: 'delivered',
  SIGNER_LOCKED: 'updated',
  EMAIL_BOUNCE: 'updated',
  DOCUMENT_SIGNED: 'signed',
}

function classify(name: string): {
  resourceType: WebhookResourceType
  action: WebhookAction
} {
  const n = name.toUpperCase()
  if (n.startsWith('PACKAGE_')) {
    return { resourceType: 'envelopes', action: ACTION_MAP[n] ?? 'updated' }
  }
  if (n.startsWith('SIGNER_')) {
    return { resourceType: 'signers', action: ACTION_MAP[n] ?? 'updated' }
  }
  if (n.startsWith('DOCUMENT_')) {
    return { resourceType: 'documents', action: ACTION_MAP[n] ?? 'updated' }
  }
  return { resourceType: 'unknown', action: 'unknown' }
}

export function parseOneSpanSignWebhookEvents(
  payload: Record<string, unknown>,
): WebhookEvent[] {
  const name = String(payload['name'] ?? payload['event'] ?? '')
  const sessionUser = String(payload['sessionUser'] ?? '')
  const packageId = String(payload['packageId'] ?? '')
  const documentId = String(payload['documentId'] ?? '')
  const signerId = String(payload['signerId'] ?? '')
  const { resourceType, action } = classify(name)
  const resourceId =
    resourceType === 'signers'
      ? signerId || packageId
      : resourceType === 'documents'
        ? documentId || packageId
        : packageId
  return [
    {
      id: `onespan-sign:${name}:${packageId}:${signerId || documentId || sessionUser}`,
      platform: 'onespan-sign',
      type: name || 'unknown',
      resourceType,
      action,
      resourceId,
      envelopeId: packageId || undefined,
      payload,
    },
  ]
}

export const OneSpanSignWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyOneSpanSignWebhook,
  parseWebhookEvents: parseOneSpanSignWebhookEvents,
}
