/**
 * OpenProject webhook verification + parsing.
 *
 * When a "Signature secret" is configured on a webhook, OpenProject signs the
 * raw request body with HMAC-SHA1 and ships it in the `X-OP-Signature` header
 * formatted as `sha1=<hexdigest>`.
 * (modules/webhooks/app/workers/represented_webhook_job.rb)
 *
 * The JSON body is `{ action: "<resource>:<verb>", <resource>: <HAL object>,
 * actor?: <User> }` — e.g. `{ action: "work_package:created", work_package:
 * {...} }`, `{ action: "project:updated", project: {...} }`.
 *
 * Docs: https://www.openproject.org/docs/system-admin-guide/api-and-webhooks/
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type { WebhookAction, WebhookEvent, WebhookResourceType } from '../../schema/webhook'

const SIG_HEADER = 'x-op-signature'

export function verifyOpenProjectWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const provided = headers[SIG_HEADER] ?? headers['X-OP-Signature']
    if (!provided) return false
    const expected = `sha1=${createHmac('sha1', secret).update(payload).digest('hex')}`
    const a = Buffer.from(expected, 'utf8')
    const b = Buffer.from(provided.trim(), 'utf8')
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

/** Map the resource half of an `<resource>:<verb>` action to canonical type. */
function mapResourceType(resource: string | undefined): WebhookResourceType {
  switch (resource) {
    case 'work_package':
    case 'work_package_comment':
      return 'tasks'
    case 'project':
      return 'projects'
    case 'time_entry':
    case 'attachment':
      return 'unknown'
    default:
      return 'unknown'
  }
}

/** Map the verb half of an `<resource>:<verb>` action to a canonical action. */
function mapAction(verb: string | undefined): WebhookAction {
  switch (verb) {
    case 'created':
      return 'created'
    case 'updated':
      return 'updated'
    case 'deleted':
      return 'deleted'
    default:
      return 'unknown'
  }
}

interface HalResource {
  id?: number | string
  _links?: { project?: { href?: string }; self?: { href?: string } }
}

/** Trailing id from a HAL href, e.g. `/api/v3/projects/3` → `"3"`. */
function hrefId(href: string | undefined): string | undefined {
  if (!href) return undefined
  const seg = href.split('/').filter(Boolean).pop()
  return seg && seg.length > 0 ? seg : undefined
}

export function parseOpenProjectWebhookEvents(
  payload: Record<string, unknown>,
): WebhookEvent[] {
  const action = typeof payload['action'] === 'string' ? (payload['action'] as string) : ''
  const [resource, verb] = action.split(':')
  const resourceType = mapResourceType(resource)

  // The resource object is keyed by its name (work_package / project / ...).
  const resourceObj =
    resource && typeof payload[resource] === 'object' && payload[resource] !== null
      ? (payload[resource] as HalResource)
      : undefined

  const resourceId = resourceObj?.id != null ? String(resourceObj.id) : ''
  const projectId =
    resource === 'project'
      ? resourceId || undefined
      : hrefId(resourceObj?._links?.project?.href)

  return [
    {
      id: `openproject:${action}:${resourceId}`,
      platform: 'openproject',
      type: action || 'unknown',
      resourceType,
      action: mapAction(verb),
      resourceId,
      projectId,
      payload,
    },
  ]
}

export const OpenProjectWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyOpenProjectWebhook,
  parseWebhookEvents: parseOpenProjectWebhookEvents,
}
