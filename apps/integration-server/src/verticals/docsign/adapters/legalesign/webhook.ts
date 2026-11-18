/**
 * Legalesign webhook (callback) verification + event parsing.
 *
 * Legalesign delivers callbacks as JSON POSTs. Each delivery is signed with
 * an HMAC-SHA256 of the raw request body using a shared secret; the
 * hex-encoded signature ships in the `X-HMAC-SHA256` header. (Legalesign
 * can alternatively sign with a downloadable public-key certificate via
 * `X-Signed-SHA256`; we verify the HMAC path, which uses the shared secret
 * configured on our side.)
 *
 * The payload has two shapes keyed by `object`:
 *   - object: 'document'  → data: { uuid, name, status, statusText, tag, ... }
 *   - object: 'recipient' → data: { uuid, email, document, status, ... }
 *
 * Docs: https://docs.legalesign.com/rest-api/how-to/webhooks
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type {
  WebhookAction,
  WebhookEvent,
  WebhookResourceType,
} from '../../schema/webhook'

const SIG_HEADER = 'x-hmac-sha256'

export function verifyLegalesignWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const provided = headers[SIG_HEADER] ?? headers[SIG_HEADER.toUpperCase()]
    if (typeof provided !== 'string' || provided.length === 0) return false
    const expectedHex = createHmac('sha256', secret).update(payload).digest('hex')
    // The X-HMAC-SHA256 header is a lowercase hex string (hexdigest), not base64.
    // Compare constant-time over the hex representation of both sides.
    const expectedBuf = Buffer.from(expectedHex, 'utf8')
    const providedBuf = Buffer.from(provided, 'utf8')
    if (providedBuf.length !== expectedBuf.length) return false
    return timingSafeEqual(providedBuf, expectedBuf)
  } catch {
    return false
  }
}

interface LegalesignCallbackBody {
  version?: number | string
  object?: string
  created?: number | string
  id?: string
  event?: string
  data?: {
    uuid?: string
    document?: string
    email?: string
    status?: number | string
    statusText?: string
    [key: string]: unknown
  }
}

/** Recipient (signer) events → canonical action. */
const RECIPIENT_ACTION_MAP: Record<string, WebhookAction> = {
  completed: 'signed',
  rejected: 'declined',
  emailOpened: 'delivered',
  visiting: 'viewed',
  bounced: 'updated',
  autoReminderEmail: 'updated',
  emailNotification: 'sent',
}

/** Document events → canonical action. */
const DOCUMENT_ACTION_MAP: Record<string, WebhookAction> = {
  created: 'created',
  rejected: 'declined',
  finalPdfCreated: 'completed',
}

function classify(object: string, event: string): {
  resourceType: WebhookResourceType
  action: WebhookAction
} {
  if (object === 'recipient') {
    return { resourceType: 'signers', action: RECIPIENT_ACTION_MAP[event] ?? 'updated' }
  }
  if (object === 'document') {
    return { resourceType: 'envelopes', action: DOCUMENT_ACTION_MAP[event] ?? 'updated' }
  }
  return { resourceType: 'unknown', action: 'unknown' }
}

export function parseLegalesignWebhookEvents(
  payload: Record<string, unknown>,
): WebhookEvent[] {
  const body = payload as LegalesignCallbackBody
  const object = String(body.object ?? '')
  const event = String(body.event ?? '')
  const data = body.data ?? {}
  const { resourceType, action } = classify(object, event)

  const recipientId = String(data.uuid ?? '')
  const documentId =
    object === 'recipient' ? String(data.document ?? '') : String(data.uuid ?? '')
  const resourceId = resourceType === 'signers' ? recipientId || documentId : documentId

  return [
    {
      id: `legalesign:${object}.${event}:${recipientId || documentId}:${body.created ?? ''}`,
      platform: 'legalesign',
      type: `${object}.${event}`,
      resourceType,
      action,
      resourceId,
      envelopeId: documentId || undefined,
      payload,
    },
  ]
}

export const LegalesignWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyLegalesignWebhook,
  parseWebhookEvents: parseLegalesignWebhookEvents,
}
