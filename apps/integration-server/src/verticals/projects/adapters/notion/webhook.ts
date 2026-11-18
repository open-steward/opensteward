/**
 * Notion webhook verification + parsing.
 *
 * Every webhook request from Notion carries an `X-Notion-Signature` header
 * containing `sha256=<hex>`, an HMAC-SHA256 of the raw request body signed
 * with the integration's `verification_token` (the shared secret surfaced
 * once during subscription setup).
 *
 * Event payloads share a common envelope: `{ id, timestamp, workspace_id,
 * type, entity: { id, type }, data }`, where `type` is a dotted string such
 * as `page.created` or `comment.created`.
 *
 * Docs: https://developers.notion.com/reference/webhooks
 *       https://developers.notion.com/reference/webhooks-events-delivery
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type { WebhookAction, WebhookEvent, WebhookResourceType } from '../../schema/webhook'

const SIG_HEADER = 'x-notion-signature'

export function verifyNotionWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const provided = headers[SIG_HEADER] ?? headers[SIG_HEADER.toLowerCase()]
    if (!provided) return false
    const expected = `sha256=${createHmac('sha256', secret).update(payload).digest('hex')}`
    const a = Buffer.from(expected, 'utf8')
    const b = Buffer.from(provided.trim(), 'utf8')
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

/** Map a Notion entity type to the canonical webhook resource type. */
function mapResourceType(entityType: string | undefined): WebhookResourceType {
  switch (entityType) {
    // Notion pages are rows-as-tasks in this vertical's mapping.
    case 'page':
    case 'block':
      return 'tasks'
    case 'data_source':
    case 'database':
      return 'projects'
    case 'comment':
      return 'comments'
    default:
      return 'unknown'
  }
}

/** Map the verb portion of a Notion event `type` (e.g. the `created` in `page.created`). */
function mapAction(verb: string | undefined): WebhookAction {
  switch (verb) {
    case 'created':
      return 'created'
    case 'updated':
    case 'content_updated':
    case 'properties_updated':
    case 'schema_updated':
    case 'moved':
    case 'locked':
    case 'unlocked':
    case 'undeleted':
      return 'updated'
    case 'deleted':
      return 'deleted'
    default:
      return 'unknown'
  }
}

interface NotionWebhookEvent {
  id?: string
  timestamp?: string
  workspace_id?: string
  type?: string
  entity?: { id?: string; type?: string }
  data?: { parent?: { id?: string; type?: string } }
}

/**
 * Notion delivers one event per request, but the canonical contract returns
 * an array — so a single envelope yields a one-element list.
 */
export function parseNotionWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const evt = payload as NotionWebhookEvent
  if (!evt.type) return []
  const verb = evt.type.includes('.') ? evt.type.slice(evt.type.indexOf('.') + 1) : evt.type
  const resourceType = mapResourceType(evt.entity?.type)
  const parent = evt.data?.parent
  return [
    {
      id: evt.id ?? `notion:${evt.type}:${evt.entity?.id ?? ''}:${evt.timestamp ?? ''}`,
      platform: 'notion',
      type: evt.type,
      resourceType,
      action: mapAction(verb),
      resourceId: evt.entity?.id ?? '',
      projectId:
        parent?.type === 'data_source' || parent?.type === 'database' ? parent.id : undefined,
      payload: evt as unknown as Record<string, unknown>,
    },
  ]
}

export const NotionWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyNotionWebhook,
  parseWebhookEvents: parseNotionWebhookEvents,
}
