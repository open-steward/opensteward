/**
 * SeaTable webhook verification + parsing.
 *
 * SeaTable webhook payload structure (docs: https://seatable.com/help/webhook-data-structure/):
 * {
 *   "event": "update",
 *   "data": {
 *     "dtable_uuid": "...",
 *     "row_id": "...",
 *     "op_user": "...",
 *     "op_type": "insert_row" | "modify_row" | "delete_row",
 *     "op_time": 1234567890,
 *     "table_id": "...",
 *     "table_name": "...",
 *     "row_name": "...",
 *     "row_data": { ... }
 *   }
 * }
 *
 * Signature: SeaTable signs the raw body with HMAC-SHA256 using the webhook
 * secret key configured at webhook creation time. The hex digest is sent in
 * the `X-SeaTable-Signature` header.
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type { WebhookAction, WebhookEvent, WebhookResourceType } from '../../schema/webhook'

const SIG_HEADER = 'x-seatable-signature'

export function verifySeatableWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const expected = createHmac('sha256', secret).update(payload).digest('hex')
    const provided =
      headers[SIG_HEADER] ?? headers['X-SeaTable-Signature'] ?? headers['x-seatable-signature']
    if (!provided) return false
    const a = Buffer.from(expected, 'utf8')
    const b = Buffer.from(provided.trim(), 'utf8')
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

function mapOpType(opType: string | undefined): {
  resourceType: WebhookResourceType
  action: WebhookAction
} {
  switch (opType) {
    case 'insert_row':
      return { resourceType: 'tasks', action: 'created' }
    case 'modify_row':
      return { resourceType: 'tasks', action: 'updated' }
    case 'delete_row':
      return { resourceType: 'tasks', action: 'deleted' }
    default:
      return { resourceType: 'unknown', action: 'unknown' }
  }
}

interface SeatableWebhookData {
  dtable_uuid?: string
  row_id?: string
  op_user?: string
  op_type?: string
  op_time?: number
  table_id?: string
  table_name?: string
  row_name?: string
  row_data?: Record<string, unknown>
}

export function parseSeatableWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const data = (payload['data'] as SeatableWebhookData) ?? {}
  const { resourceType, action } = mapOpType(data.op_type)
  const id = `seatable:${data.op_type ?? 'unknown'}:${data.row_id ?? ''}:${data.op_time ?? 0}`
  return [
    {
      id,
      platform: 'seatable',
      type: data.op_type ?? 'unknown',
      resourceType,
      action,
      resourceId: data.row_id ?? '',
      projectId: data.dtable_uuid,
      payload: payload,
    },
  ]
}

export const seatableWebhook: WebhookHandler = { verifyWebhook: verifySeatableWebhook, parseWebhookEvents: parseSeatableWebhookEvents }
