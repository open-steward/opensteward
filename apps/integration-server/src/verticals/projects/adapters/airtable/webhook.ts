/**
 * Airtable webhook verification + parsing.
 *
 * Airtable signs webhooks with HMAC-SHA256 of the raw body using the
 * `X-Hook-Secret` shared at registration. The signature ships as
 * `X-Hook-Signature` (hex).
 *
 * Docs: https://developers.asana.com/docs/webhooks
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type { WebhookAction, WebhookEvent, WebhookResourceType } from '../../schema/webhook'

const SIG_HEADERS = ['x-airtable-signature', 'X-Uairtable-Signature']

export function verifyAirtableWebhook(
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

function mapResourceType(resourceType: string | undefined): WebhookResourceType {
  switch (resourceType) {
    case 'task':
      return 'tasks'
    case 'project':
      return 'projects'
    case 'story':
      return 'comments'
    case 'tag':
      return 'tags'
    case 'workspace':
      return 'workspaces'
    case 'user':
      return 'users'
    default:
      return 'unknown'
  }
}

function mapAction(action: string | undefined): WebhookAction {
  switch (action) {
    case 'added':
      return 'created'
    case 'changed':
      return 'updated'
    case 'removed':
    case 'deleted':
      return 'deleted'
    case 'undeleted':
      return 'updated'
    default:
      return 'unknown'
  }
}

interface AsanaEvent {
  user?: { gid: string }
  resource?: { gid: string; resource_type?: string }
  action?: string
  created_at?: string
  change?: { field: string; action: string }
  parent?: { gid: string; resource_type?: string }
}

export function parseAirtableWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const events = (payload['events'] as AsanaEvent[]) ?? []
  return events.map((evt, i) => {
    const resourceType = mapResourceType(evt.resource?.resource_type)
    const action = mapAction(evt.action)
    return {
      id: `asana:${evt.action ?? ''}:${evt.resource?.gid ?? ''}:${evt.created_at ?? i}`,
      platform: 'airtable',
      type: `${evt.resource?.resource_type ?? 'unknown'}.${evt.action ?? 'unknown'}`,
      resourceType,
      action,
      resourceId: evt.resource?.gid ?? '',
      projectId:
        evt.parent?.resource_type === 'project' ? evt.parent.gid : undefined,
      payload: evt as unknown as Record<string, unknown>,
    }
  })
}

export const AirtableWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyAirtableWebhook,
  parseWebhookEvents: parseAirtableWebhookEvents,
}
