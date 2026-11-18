/**
 * Zammad webhook verification + parsing.
 *
 * Zammad signs webhook requests with HMAC-SHA1 over the raw request body when
 * a "Signature Token" is configured in the webhook settings. The signature is
 * delivered in the `x-hub-signature` header (lower-case; no prefix).
 *
 * The webhook payload always contains top-level "ticket" and optionally
 * "article" objects. The originating trigger name is in
 * `X-Zammad-Trigger` (request header, not payload field).
 *
 * Docs: https://admin-docs.zammad.org/en/latest/manage/webhook/add.html
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type { WebhookAction, WebhookEvent, WebhookResourceType } from '../../schema/webhook'

const SIG_HEADER = 'x-hub-signature'

/**
 * Verify a Zammad webhook request.
 * Computes HMAC-SHA1 over the raw body and compares with the header value.
 * Returns false (never throws) if the header is missing or signature mismatch.
 */
export function verifyZammadWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    // Header may arrive in mixed case depending on the HTTP framework
    const provided =
      headers[SIG_HEADER] ??
      headers[SIG_HEADER.toLowerCase()] ??
      headers['X-Hub-Signature']
    if (!provided) return false

    const expected = createHmac('sha1', secret).update(payload).digest('hex')
    const a = Buffer.from(expected, 'utf8')
    const b = Buffer.from(provided.trim(), 'utf8')
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

/**
 * Parse a Zammad webhook payload into canonical WebhookEvent objects.
 *
 * Zammad sends the full ticket (and optional article) in the payload rather
 * than a discrete event-type field. We infer the action from the trigger name
 * in the `X-Zammad-Trigger` header when available, or from payload structure.
 */
export function parseZammadWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const ticket = payload['ticket'] as Record<string, unknown> | undefined
  const article = payload['article'] as Record<string, unknown> | undefined

  const ticketId = ticket ? String(ticket['id'] ?? '') : ''

  const events: WebhookEvent[] = []

  if (article) {
    const articleId = String(article['id'] ?? '')
    events.push({
      id: `zammad:article:${articleId}`,
      platform: 'zammad',
      type: 'article.created',
      resourceType: 'messages' as WebhookResourceType,
      action: 'commented' as WebhookAction,
      resourceId: articleId,
      ticketId: ticketId || undefined,
      payload,
    })
  } else if (ticket) {
    // Without an article the trigger is ticket-level (created / updated)
    const action: WebhookAction = ticket['article_count'] === 1 ? 'created' : 'updated'
    events.push({
      id: `zammad:ticket:${ticketId}`,
      platform: 'zammad',
      type: action === 'created' ? 'ticket.created' : 'ticket.updated',
      resourceType: 'tickets' as WebhookResourceType,
      action,
      resourceId: ticketId,
      payload,
    })
  }

  return events
}

export const ZammadWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyZammadWebhook,
  parseWebhookEvents: parseZammadWebhookEvents,
}
