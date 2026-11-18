/**
 * ActiveCollab webhook verification + parsing.
 *
 * ActiveCollab does NOT sign webhook deliveries with an HMAC. Instead, when a
 * webhook is configured with an optional secret, that secret is echoed back
 * verbatim in the `X-Angie-WebhookSecret` header of every POST. Verification
 * is therefore a constant-time comparison of that header against the
 * configured secret.
 *
 * Delivery body shape:
 *   { "payload": <serialized object>, "timestamp": <epoch>, "type": "TaskCreated" }
 *
 * `type` is a PascalCase `<Resource><Action>` string, e.g. `TaskCreated`,
 * `ProjectUpdated`, `CommentCreated`, `TaskCompleted`.
 *
 * Docs: https://activecollab.com/help/books/my-active-collab/webhooks
 */
import { timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type { WebhookAction, WebhookEvent, WebhookResourceType } from '../../schema/webhook'
import { WEBHOOK_SECRET_HEADER } from './constants'

export function verifyActivecollabWebhook(
  _payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    if (!secret) return false
    const headerName = WEBHOOK_SECRET_HEADER.toLowerCase()
    const provided = headers[headerName] ?? headers[WEBHOOK_SECRET_HEADER]
    if (!provided) return false
    const a = Buffer.from(secret, 'utf8')
    const b = Buffer.from(provided.trim(), 'utf8')
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

/** Split a PascalCase `type` (e.g. `TaskCreated`) into resource + action. */
function splitEventType(type: string | undefined): { resource: string; action: string } {
  if (!type) return { resource: '', action: '' }
  const match = type.match(
    /^(.*?)(Created|Updated|Deleted|Completed|Reopened|Moved|Copied|Trashed|Restored|Invited|Accepted)$/,
  )
  if (match) return { resource: match[1].toLowerCase(), action: match[2].toLowerCase() }
  return { resource: type.toLowerCase(), action: '' }
}

function mapResourceType(resource: string): WebhookResourceType {
  switch (resource) {
    case 'task':
    case 'subtask':
      return 'tasks'
    case 'project':
      return 'projects'
    case 'comment':
      return 'comments'
    case 'label':
      return 'tags'
    case 'user':
      return 'users'
    default:
      return 'unknown'
  }
}

function mapAction(action: string): WebhookAction {
  switch (action) {
    case 'created':
    case 'invited':
    case 'accepted':
      return 'created'
    case 'updated':
    case 'moved':
    case 'copied':
    case 'restored':
      return 'updated'
    case 'deleted':
    case 'trashed':
      return 'deleted'
    case 'completed':
      return 'completed'
    case 'reopened':
      return 'reopened'
    default:
      return 'unknown'
  }
}

interface ActivecollabDelivery {
  type?: string
  timestamp?: number | string
  payload?: {
    id?: number | string
    project_id?: number | string
    parent_id?: number | string
    parent_type?: string
    [key: string]: unknown
  }
}

export function parseActivecollabWebhookEvents(
  payload: Record<string, unknown>,
): WebhookEvent[] {
  const delivery = payload as ActivecollabDelivery
  const { resource, action } = splitEventType(delivery.type)
  const obj = delivery.payload ?? {}
  const resourceId = obj.id != null ? String(obj.id) : ''
  const projectId =
    obj.project_id != null
      ? String(obj.project_id)
      : (obj.parent_type ?? '').toLowerCase() === 'project' && obj.parent_id != null
        ? String(obj.parent_id)
        : undefined

  return [
    {
      id: `activecollab:${delivery.type ?? 'unknown'}:${resourceId}:${delivery.timestamp ?? ''}`,
      platform: 'activecollab',
      type: delivery.type ?? 'unknown',
      resourceType: mapResourceType(resource),
      action: mapAction(action),
      resourceId,
      projectId,
      payload: (delivery.payload ?? {}) as Record<string, unknown>,
    },
  ]
}

export const ActivecollabWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyActivecollabWebhook,
  parseWebhookEvents: parseActivecollabWebhookEvents,
}
