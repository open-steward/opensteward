/**
 * Plane webhook verification + parsing.
 *
 * Plane signs each delivery with HMAC-SHA256 of the raw request body using the
 * per-webhook secret generated at registration. The signature ships as a hex
 * digest in the `X-Plane-Signature` header. `X-Plane-Event` carries the event
 * name and `X-Plane-Delivery` a per-delivery UUID.
 *
 * Payloads are a single event object: `{ event, action, webhook_id,
 * workspace_id, data }`. DELETE actions carry only the entity id in `data`.
 * Docs: https://developers.plane.so/dev-tools/intro-webhooks
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type { WebhookAction, WebhookEvent, WebhookResourceType } from '../../schema/webhook'

const SIG_HEADERS = ['x-plane-signature', 'X-Plane-Signature']

export function verifyPlaneWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const expected = createHmac('sha256', secret).update(payload).digest('hex')
    const a = Buffer.from(expected, 'utf8')
    for (const name of SIG_HEADERS) {
      const provided = headers[name] ?? headers[name.toLowerCase()]
      if (!provided) continue
      const b = Buffer.from(provided.trim(), 'utf8')
      if (a.length !== b.length) continue
      if (timingSafeEqual(a, b)) return true
    }
    return false
  } catch {
    return false
  }
}

function mapResourceType(event: string | undefined): WebhookResourceType {
  switch (event) {
    case 'issue':
    case 'work_item':
      return 'tasks'
    case 'project':
      return 'projects'
    case 'issue_comment':
      return 'comments'
    default:
      return 'unknown'
  }
}

function mapAction(action: string | undefined): WebhookAction {
  switch (action) {
    case 'created':
    case 'create':
    case 'POST':
      return 'created'
    case 'updated':
    case 'update':
    case 'PATCH':
      return 'updated'
    case 'deleted':
    case 'delete':
    case 'DELETE':
      return 'deleted'
    default:
      return 'unknown'
  }
}

interface PlaneWebhookPayload {
  event?: string
  action?: string
  webhook_id?: string
  workspace_id?: string
  data?: { id?: string; project?: string; [key: string]: unknown }
}

export function parsePlaneWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const evt = payload as PlaneWebhookPayload
  const resourceType = mapResourceType(evt.event)
  const action = mapAction(evt.action)
  const resourceId = evt.data?.id ?? ''
  const projectId =
    evt.event === 'project' ? evt.data?.id : (evt.data?.project as string | undefined)
  return [
    {
      id: `plane:${evt.webhook_id ?? ''}:${evt.event ?? ''}:${resourceId}`,
      platform: 'plane',
      type: `${evt.event ?? 'unknown'}.${evt.action ?? 'unknown'}`,
      resourceType,
      action,
      resourceId,
      projectId,
      payload: evt as unknown as Record<string, unknown>,
    },
  ]
}

export const PlaneWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyPlaneWebhook,
  parseWebhookEvents: parsePlaneWebhookEvents,
}
