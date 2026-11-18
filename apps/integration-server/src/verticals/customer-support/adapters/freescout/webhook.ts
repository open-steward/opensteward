/**
 * FreeScout webhook verification + parsing.
 *
 * FreeScout signs each webhook request with HMAC-SHA1 over the raw request
 * body using a secret key configurable in Manage > API & Webhooks.
 * The signature is base64-encoded and delivered in the `X-FreeScout-Signature`
 * header.  The event name is in the `X-FreeScout-Event` header.
 *
 * Verification algorithm (PHP reference from docs):
 *   base64_encode(hash_hmac('sha1', $rawBody, $secret, true))
 *
 * Docs: https://api-docs.freescout.net/
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type { WebhookAction, WebhookEvent, WebhookResourceType } from '../../schema/webhook'

const SIG_HEADER = 'x-freescout-signature'
/**
 * The HTTP header that carries the event type (e.g. "convo.created").
 * Callers that have access to raw request headers should inject the value
 * into the payload before calling parseFreescoutWebhookEvents, either as
 * `payload[EVENT_HEADER]` (keyed by this constant) or as `payload['_event']`.
 */
export const EVENT_HEADER = 'x-freescout-event'

export function verifyFreescoutWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const provided = headers[SIG_HEADER] ?? headers['X-FreeScout-Signature']
    if (!provided) return false
    const expected = createHmac('sha1', secret).update(payload).digest('base64')
    const a = Buffer.from(expected, 'utf8')
    const b = Buffer.from(provided.trim(), 'utf8')
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

/**
 * FreeScout webhook event types (from X-FreeScout-Event header or payload.event).
 * https://api-docs.freescout.net/
 */
const ACTION_MAP: Record<string, { resourceType: WebhookResourceType; action: WebhookAction }> = {
  'convo.created':               { resourceType: 'tickets',  action: 'created'    },
  'convo.assigned':              { resourceType: 'tickets',  action: 'assigned'   },
  'convo.deleted':               { resourceType: 'tickets',  action: 'deleted'    },
  'convo.moved':                 { resourceType: 'tickets',  action: 'updated'    },
  'convo.status':                { resourceType: 'tickets',  action: 'updated'    },
  'convo.customer.reply.created':{ resourceType: 'messages', action: 'commented'  },
  'convo.agent.reply.created':   { resourceType: 'messages', action: 'commented'  },
  'convo.note.created':          { resourceType: 'messages', action: 'commented'  },
  'customer.created':            { resourceType: 'contacts', action: 'created'    },
  'customer.updated':            { resourceType: 'contacts', action: 'updated'    },
}

export function parseFreescoutWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  // FreeScout sends the event type in the X-FreeScout-Event request header.
  // Callers inject it into the payload keyed by EVENT_HEADER or by the '_event'
  // convention before invoking this function.  The payload body may also carry
  // an 'event' field for forward-compatibility.
  const type = String(payload[EVENT_HEADER] ?? payload['event'] ?? payload['_event'] ?? '')
  const conversation = (payload['conversation'] as Record<string, unknown> | undefined) ?? {}
  const convoId = String(conversation['id'] ?? payload['id'] ?? '')

  const mapped = ACTION_MAP[type] ?? {
    resourceType: 'unknown' as WebhookResourceType,
    action: 'unknown' as WebhookAction,
  }

  const isMessageEvent = mapped.resourceType === 'messages'
  const thread = (payload['thread'] as Record<string, unknown> | undefined) ?? {}
  const threadId = String(thread['id'] ?? '')
  const resourceId = isMessageEvent ? threadId || convoId : convoId

  return [
    {
      id: `freescout:${type}:${resourceId}`,
      platform: 'freescout',
      type,
      resourceType: mapped.resourceType,
      action: mapped.action,
      resourceId,
      ticketId: isMessageEvent ? convoId : undefined,
      payload,
    },
  ]
}

export const FreescoutWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyFreescoutWebhook,
  parseWebhookEvents: parseFreescoutWebhookEvents,
}
