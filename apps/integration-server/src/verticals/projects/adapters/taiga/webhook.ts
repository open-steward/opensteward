/**
 * Taiga webhook verification + parsing.
 *
 * Taiga signs webhook POST bodies with HMAC-SHA1 of the raw request body
 * using the webhook's secret key. The digest is delivered as the hex-encoded
 * value of the `X-TAIGA-WEBHOOK-SIGNATURE` request header.
 *
 * Payload shape:
 *   { action: 'create'|'change'|'delete'|'test',
 *     type: 'userstory'|'task'|'issue'|'milestone'|'wikipage',
 *     by: { id, username, full_name, ... },
 *     date: <ISO string>,
 *     data: { id, project: { id }, ... },
 *     change?: { diff: { ... } }  // only for 'change' action
 *   }
 *
 * Docs: https://docs.taiga.io/webhooks.html
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type { WebhookAction, WebhookEvent, WebhookResourceType } from '../../schema/webhook'

const SIG_HEADER = 'x-taiga-webhook-signature'

export function verifyTaigaWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const expected = createHmac('sha1', secret).update(payload).digest('hex')
    const provided = headers[SIG_HEADER] ?? headers[SIG_HEADER.toLowerCase()] ?? headers['X-TAIGA-WEBHOOK-SIGNATURE']
    if (!provided) return false
    const a = Buffer.from(expected, 'utf8')
    const b = Buffer.from(provided.trim(), 'utf8')
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

function mapResourceType(type: string | undefined): WebhookResourceType {
  switch (type) {
    case 'userstory':
    case 'task':
    case 'issue':
      return 'tasks'
    case 'milestone':
      return 'projects'
    case 'wikipage':
      return 'unknown'
    default:
      return 'unknown'
  }
}

function mapAction(action: string | undefined): WebhookAction {
  switch (action) {
    case 'create':
      return 'created'
    case 'change':
      return 'updated'
    case 'delete':
      return 'deleted'
    default:
      return 'unknown'
  }
}

interface TaigaWebhookPayload {
  action?: string
  type?: string
  by?: { id?: number }
  date?: string
  data?: { id?: number; project?: { id?: number } }
}

export function parseTaigaWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const evt = payload as TaigaWebhookPayload
  if (!evt.action || evt.action === 'test') return []
  const resourceId = String(evt.data?.id ?? '')
  const projectId = evt.data?.project?.id != null ? String(evt.data.project.id) : undefined
  return [
    {
      id: `taiga:${evt.action}:${evt.type ?? 'unknown'}:${resourceId}:${evt.date ?? ''}`,
      platform: 'taiga',
      type: `${evt.type ?? 'unknown'}.${evt.action}`,
      resourceType: mapResourceType(evt.type),
      action: mapAction(evt.action),
      resourceId,
      projectId,
      payload: payload,
    },
  ]
}

export const TaigaWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyTaigaWebhook,
  parseWebhookEvents: parseTaigaWebhookEvents,
}
