/**
 * Pyrus webhook verification + parsing.
 *
 * Pyrus signs webhook payloads using HMAC-SHA1.
 * The HMAC key is the bot's security_key (UTF-8 encoded).
 * The HMAC message is the raw request body only (NOT body+key).
 * The result is hex-encoded and compared against the `X-Pyrus-Sig` header.
 *
 * Reference (Python):
 *   hmac.new(secret.encode('utf-8'), msg=body, digestmod=hashlib.sha1).hexdigest()
 *
 * Docs: https://pyrus.com/en/help/api/webhooks
 *
 * Pyrus webhook payload shape:
 * {
 *   "event": "comment",
 *   "access_token": "...",
 *   "task_id": 12345,
 *   "user_id": 67890,
 *   "task": { ... full task object ... }
 * }
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type { WebhookAction, WebhookEvent, WebhookResourceType } from '../../schema/webhook'

const SIG_HEADER = 'x-pyrus-sig'

export function verifyPyrusWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    // Normalise header lookup to lowercase
    const provided =
      headers[SIG_HEADER] ??
      headers['X-Pyrus-Sig'] ??
      headers[SIG_HEADER.toLowerCase()]
    if (!provided) return false

    // Pyrus signs: HMAC-SHA1(key=securityKey, msg=body)
    // The message is the raw request body only; the security_key is the HMAC key.
    const expected = createHmac('sha1', secret).update(payload).digest('hex')

    const a = Buffer.from(expected, 'utf8')
    const b = Buffer.from(provided.trim().toLowerCase(), 'utf8')
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

const ACTION_MAP: Record<string, { resourceType: WebhookResourceType; action: WebhookAction }> = {
  comment: { resourceType: 'messages', action: 'commented' },
}

export function parsePyrusWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const event = String(payload['event'] ?? '')
  const taskId = String(payload['task_id'] ?? '')
  const mapped = ACTION_MAP[event] ?? {
    resourceType: 'tickets' as WebhookResourceType,
    action: 'updated' as WebhookAction,
  }

  return [
    {
      id: `pyrus:${event}:${taskId}`,
      platform: 'pyrus',
      type: event,
      resourceType: mapped.resourceType,
      action: mapped.action,
      resourceId: taskId,
      ticketId: mapped.resourceType === 'messages' ? taskId : undefined,
      payload,
    },
  ]
}

export const PyrusWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyPyrusWebhook,
  parseWebhookEvents: parsePyrusWebhookEvents,
}
