/**
 * Teamwork Spaces webhook verification + event parsing.
 *
 * When a webhook fires, Teamwork Spaces sends a HTTP POST to the registered
 * URL. The request body is the JSON payload for the event type (same model as
 * the corresponding API resource). A HMAC-SHA256 hex-encoded signature of the
 * raw request body is sent in the `Signature` header; the signing secret is
 * the optional token supplied when the webhook was created.
 *
 * Docs: https://apidocs.teamwork.com/guides/spaces/webhooks
 *
 * Event types (dot-delimited noun.verb):
 *   page.created, page.updated, page.deleted,
 *   page.updated.reverted, page.updated.moved,
 *   page.updated.trashed, page.updated.restored,
 *   comment.created, comment.updated, comment.deleted,
 *   space.deleted, space.imported,
 *   user.updated, user.enabled, user.disabled,
 *   access.created,
 *   pagepermission.created, permission.deleted, pagepermissions.deleted,
 *   pluginstate.created, pluginstate.updated
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type { WebhookAction, WebhookEvent, WebhookResourceType } from '../../schema/webhook'

/**
 * Verify the HMAC-SHA256 hex signature sent in the `Signature` header.
 * Returns `true` if the signature matches; `false` on any mismatch or error.
 */
export function verifySpacesWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const expected = createHmac('sha256', secret).update(payload).digest('hex')
    const a = Buffer.from(expected, 'utf8')
    // The header name is "Signature" (canonical casing per the docs).
    const provided =
      headers['Signature'] ?? headers['signature'] ?? ''
    if (!provided) return false
    const b = Buffer.from(provided.trim(), 'utf8')
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

/**
 * Map a Spaces event-type noun (first dot-segment) to a canonical
 * WebhookResourceType.
 */
function mapResourceType(noun: string | undefined): WebhookResourceType {
  switch (noun) {
    case 'page':
      return 'tasks'
    case 'space':
      return 'projects'
    case 'comment':
      return 'comments'
    case 'user':
      return 'users'
    default:
      return 'unknown'
  }
}

/**
 * Map a Spaces event-type verb (second dot-segment) to a canonical
 * WebhookAction.
 */
function mapAction(verb: string | undefined): WebhookAction {
  switch (verb) {
    case 'created':
    case 'imported':
    case 'enabled':
      return 'created'
    case 'updated':
    case 'reverted':
    case 'moved':
    case 'restored':
      return 'updated'
    case 'deleted':
    case 'trashed':
    case 'disabled':
      return 'deleted'
    default:
      return 'unknown'
  }
}

/**
 * Minimal shape of a Teamwork Spaces webhook payload.
 * The outer envelope carries `event` (type string) and `data` (resource body).
 * Individual delivery headers supply the event name again.
 */
interface SpacesWebhookPayload {
  event?: string
  data?: {
    id?: number | string
    spaceId?: number | string
    space?: { id?: number | string } | null
    [key: string]: unknown
  }
}

export function parseSpacesWebhookEvents(
  payload: Record<string, unknown>,
): WebhookEvent[] {
  const { event, data } = payload as SpacesWebhookPayload
  if (!event) return []

  const parts = event.split('.')
  const noun = parts[0]
  const verb = parts[1]

  const resourceType = mapResourceType(noun)
  const action = mapAction(verb)

  const resourceId = data?.id != null ? String(data.id) : ''
  // Attempt to derive the parent space/project id for page events.
  const spaceId =
    data?.spaceId != null
      ? String(data.spaceId)
      : data?.space?.id != null
        ? String(data.space.id)
        : undefined
  const projectId = noun === 'page' ? spaceId : undefined

  return [
    {
      id: `teamwork-desk:${event}:${resourceId}`,
      platform: 'teamwork-desk',
      type: event,
      resourceType,
      action,
      resourceId,
      projectId,
      payload: payload,
    },
  ]
}

export const TeamworkSpacesWebhookHandler: WebhookHandler = {
  verifyWebhook: verifySpacesWebhook,
  parseWebhookEvents: parseSpacesWebhookEvents,
}
