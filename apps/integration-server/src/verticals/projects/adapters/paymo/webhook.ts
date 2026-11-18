/**
 * Paymo webhook verification + parsing.
 *
 * Paymo signs each delivery with the HMAC-SHA1 hex digest of the raw request
 * body, keyed by the secret supplied when the webhook was created. The digest
 * ships in the `X-Paymo-Signature` header, prefixed with `sha1=`:
 *
 *   X-Paymo-Signature: sha1=dc03736e396e70138bf7af4ffaa2948cde42dcf1
 *
 * The event name (`model.[action].[Object]`, e.g. `model.insert.Task`) is sent
 * in the `X-Paymo-Event` header — NOT in the body. The body itself is the
 * affected object for insert/update events, or `{ "id": <id> }` for deletes.
 * Because `parseWebhookEvents` only receives the parsed body (headers are not
 * threaded through), the resource type / action are inferred best-effort from
 * the body's field shape.
 *
 * Docs: https://github.com/paymo-org/api/blob/master/sections/webhooks.md
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type { WebhookAction, WebhookEvent, WebhookResourceType } from '../../schema/webhook'
import { WEBHOOK_SIGNATURE_HEADER } from './constants'

export function verifyPaymoWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    if (!secret) return false
    const provided =
      headers[WEBHOOK_SIGNATURE_HEADER] ?? headers[WEBHOOK_SIGNATURE_HEADER.toUpperCase()]
    if (!provided) return false
    // Header is `sha1=<hex>`; strip the algorithm prefix before comparing.
    const sig = provided.trim().replace(/^sha1=/i, '')
    const expected = createHmac('sha1', secret).update(payload).digest('hex')
    const a = Buffer.from(expected, 'utf8')
    const b = Buffer.from(sig, 'utf8')
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

interface PaymoWebhookBody {
  id?: number | string
  // Discriminating fields used to infer the resource type from the body shape.
  project_id?: number | string
  tasklist_id?: number | string
  client_id?: number | string
  status_id?: number | string
  content?: string
  thread_id?: number | string
  email?: string
  type?: string
  [key: string]: unknown
}

/**
 * Infer the canonical resource type from the body's field shape. Paymo's event
 * name (the authoritative source) lives in the `X-Paymo-Event` header, which is
 * unavailable here, so this is a best-effort fallback over the body fields.
 */
function inferResourceType(body: PaymoWebhookBody): WebhookResourceType {
  if (body.tasklist_id !== undefined || (body.project_id !== undefined && body.thread_id === undefined && body.content === undefined))
    return 'tasks'
  if (body.client_id !== undefined || body.status_id !== undefined) return 'projects'
  if (body.content !== undefined || body.thread_id !== undefined) return 'comments'
  if (body.email !== undefined || body.type !== undefined) return 'users'
  return 'unknown'
}

export function parsePaymoWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const body = payload as PaymoWebhookBody
  const resourceId = body.id != null ? String(body.id) : ''
  const resourceType = inferResourceType(body)
  // Action is carried in the `X-Paymo-Event` header (model.[action].[Object])
  // and not recoverable from the body alone.
  const action: WebhookAction = 'unknown'
  const projectId = body.project_id != null ? String(body.project_id) : undefined

  return [
    {
      id: `paymo:${resourceType}:${resourceId}`,
      platform: 'paymo',
      type: `${resourceType}.${action}`,
      resourceType,
      action,
      resourceId,
      projectId,
      payload,
    },
  ]
}

export const PaymoWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyPaymoWebhook,
  parseWebhookEvents: parsePaymoWebhookEvents,
}
