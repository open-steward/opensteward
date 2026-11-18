/**
 * Vikunja webhook verification + parsing.
 *
 * Vikunja signs webhook deliveries with HMAC-SHA256 of the raw JSON request
 * body, using the shared `secret` configured when the webhook was created.
 * The hex-encoded digest is sent in the `X-Vikunja-Signature` header.
 *
 * Source: pkg/models/webhooks.go — `sig256 := hmac.New(sha256.New, []byte(w.Secret))`
 *         + `signature := hex.EncodeToString(sig256.Sum(nil))`
 *         + `req.Header.Add("X-Vikunja-Signature", signature)`
 *
 * Webhook payload structure (from the docs):
 *   { event_name: string, time: string (ISO-8601), data: object }
 *
 * Available event names (from pkg/models/events.go):
 *   task.created, task.updated, task.deleted,
 *   task.assignee.created, task.assignee.deleted,
 *   task.comment.created, task.comment.edited, task.comment.deleted,
 *   task.attachment.created, task.attachment.deleted,
 *   task.relation.created, task.relation.deleted,
 *   project.created, project.updated, project.deleted,
 *   project.shared.user, project.shared.team,
 *   team.member.added, team.member.removed, team.created, team.deleted.
 *
 * Docs: https://vikunja.io/docs/webhooks/
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type { WebhookAction, WebhookEvent, WebhookResourceType } from '../../schema/webhook'

const SIG_HEADER = 'x-vikunja-signature'

export function verifyVikunjaWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const expected = createHmac('sha256', secret).update(payload).digest('hex')
    const provided =
      headers[SIG_HEADER] ?? headers['X-Vikunja-Signature'] ?? headers[SIG_HEADER.toUpperCase()]
    if (!provided) return false
    const a = Buffer.from(expected, 'utf8')
    const b = Buffer.from(provided.trim(), 'utf8')
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

/**
 * Map a Vikunja event_name to a canonical WebhookResourceType.
 * Event names follow the pattern `<resource>.<action>`.
 */
function mapResourceType(eventName: string | undefined): WebhookResourceType {
  if (!eventName) return 'unknown'
  const resource = eventName.split('.')[0]
  switch (resource) {
    case 'task':
      return 'tasks'
    case 'project':
      return 'projects'
    default:
      return 'unknown'
  }
}

/**
 * Map the action part of a Vikunja event_name to a canonical WebhookAction.
 * For compound names like `task.comment.created` we use the last segment.
 */
function mapAction(eventName: string | undefined): WebhookAction {
  if (!eventName) return 'unknown'
  const parts = eventName.split('.')
  const action = parts[parts.length - 1]
  switch (action) {
    case 'created':
    case 'added':
    case 'shared':
      return 'created'
    case 'updated':
    case 'edited':
      return 'updated'
    case 'deleted':
    case 'removed':
      return 'deleted'
    default:
      return 'unknown'
  }
}

interface VikunjaWebhookPayload {
  event_name?: string
  time?: string
  data?: Record<string, unknown>
}

export function parseVikunjaWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  // Vikunja sends one event per delivery: { event_name, time, data }
  const p = payload as VikunjaWebhookPayload
  const eventName = p.event_name
  const data = p.data ?? {}

  // Extract resource id from the data object (task.id or project.id)
  const resourceId = String(
    (data['id'] as number | string | undefined) ??
    (data['task'] as Record<string, unknown> | undefined)?.['id'] ??
    '',
  )

  const projectId =
    (data['project_id'] as number | string | undefined) != null
      ? String(data['project_id'])
      : (data['project'] as Record<string, unknown> | undefined)?.['id'] != null
        ? String((data['project'] as Record<string, unknown>)['id'])
        : undefined

  return [
    {
      id: `vikunja:${eventName ?? 'unknown'}:${resourceId}:${p.time ?? Date.now()}`,
      platform: 'vikunja',
      type: eventName ?? 'unknown',
      resourceType: mapResourceType(eventName),
      action: mapAction(eventName),
      resourceId,
      projectId,
      payload: payload,
    },
  ]
}

export const VikunjaWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyVikunjaWebhook,
  parseWebhookEvents: parseVikunjaWebhookEvents,
}
