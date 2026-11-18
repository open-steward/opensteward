/**
 * Microsoft Graph change-notification verification + parsing for To Do.
 *
 * `todoTask` resources support change notifications delivered as webhooks
 * (worldwide endpoint only). Graph does NOT HMAC-sign the request body.
 * Instead, each notification carries the `clientState` value that the app
 * supplied when creating the subscription; the receiver verifies authenticity
 * by comparing it (constant-time) against the stored secret.
 *
 * Subscription validation handshakes (a `validationToken` query parameter to
 * be echoed back) are handled at the HTTP layer, not here.
 *
 * Docs: https://learn.microsoft.com/en-us/graph/change-notifications-delivery-webhooks
 */
import { timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type { WebhookAction, WebhookEvent, WebhookResourceType } from '../../schema/webhook'

/**
 * Verify a Graph change notification by comparing the `clientState` carried
 * in every notification item against the shared secret. Graph sends the same
 * `clientState` on each item in the batch, so a single match authenticates
 * the delivery.
 */
export function verifyMicrosoftTodoWebhook(
  payload: Buffer,
  _headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const parsed = JSON.parse(payload.toString('utf8')) as { value?: Array<{ clientState?: string }> }
    const expected = Buffer.from(secret, 'utf8')
    for (const item of parsed.value ?? []) {
      const provided = item.clientState
      if (!provided) continue
      const b = Buffer.from(provided, 'utf8')
      if (expected.length !== b.length) continue
      if (timingSafeEqual(expected, b)) return true
    }
    return false
  } catch {
    return false
  }
}

function mapResourceType(resource: string | undefined): WebhookResourceType {
  if (!resource) return 'unknown'
  // Graph resource paths look like:
  //   /me/todo/lists/{listId}/tasks/{taskId}
  //   /me/todo/lists/{listId}
  if (/\/tasks(\/|$)/.test(resource)) return 'tasks'
  if (/\/lists(\/|$)/.test(resource)) return 'projects'
  return 'unknown'
}

function mapAction(changeType: string | undefined): WebhookAction {
  switch (changeType) {
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

/** A single item in a Graph change-notification collection. */
interface GraphNotification {
  subscriptionId?: string
  changeType?: string
  resource?: string
  clientState?: string
  resourceData?: { id?: string; '@odata.id'?: string; '@odata.type'?: string }
  tenantId?: string
}

function extractListId(resource: string | undefined): string | undefined {
  if (!resource) return undefined
  const m = resource.match(/\/lists\/([^/]+)/)
  return m ? m[1] : undefined
}

function extractResourceId(evt: GraphNotification): string {
  if (evt.resourceData?.id) return evt.resourceData.id
  const resource = evt.resource ?? ''
  const tail = resource.split('/').filter(Boolean).pop()
  return tail ?? ''
}

export function parseMicrosoftTodoWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const notifications = (payload['value'] as GraphNotification[]) ?? []
  return notifications.map((evt, i) => {
    const resourceType = mapResourceType(evt.resource)
    const action = mapAction(evt.changeType)
    const resourceId = extractResourceId(evt)
    return {
      id: `microsoft-todo:${evt.changeType ?? ''}:${resourceId}:${evt.subscriptionId ?? i}`,
      platform: 'microsoft-todo',
      type: `${resourceType}.${evt.changeType ?? 'unknown'}`,
      resourceType,
      action,
      resourceId,
      projectId: resourceType === 'tasks' ? extractListId(evt.resource) : undefined,
      payload: evt as unknown as Record<string, unknown>,
    }
  })
}

export const MicrosoftTodoWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyMicrosoftTodoWebhook,
  parseWebhookEvents: parseMicrosoftTodoWebhookEvents,
}
