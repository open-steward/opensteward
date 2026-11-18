/**
 * Favro webhook verification + parsing.
 *
 * Favro signs webhook deliveries with HMAC-SHA1 of the concatenation
 * `payloadId + webhookUrl`, using the webhook's shared secret as the key.
 * The result is base64-encoded and sent in the `X-Favro-Webhook` request header.
 *
 * Docs: https://favro.com/developer/#webhooks
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type { WebhookAction, WebhookEvent, WebhookResourceType } from '../../schema/webhook'

const SIG_HEADER = 'x-favro-webhook'

export function verifyFavroWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    // Favro signs payloadId + webhookUrl with the shared secret (HMAC-SHA1,
    // base64-encoded). The payloadId is embedded in the JSON body.
    const body = JSON.parse(payload.toString('utf8')) as Record<string, unknown>
    const payloadId = typeof body['payloadId'] === 'string' ? body['payloadId'] : ''
    const webhookUrl = typeof body['webhookUrl'] === 'string' ? body['webhookUrl'] : ''
    const text = payloadId + webhookUrl
    const expected = createHmac('sha1', secret).update(text).digest('base64')
    const provided = headers[SIG_HEADER] ?? headers[SIG_HEADER.toLowerCase()]
    if (!provided) return false
    const a = Buffer.from(expected, 'utf8')
    const b = Buffer.from(provided.trim(), 'utf8')
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

function mapResourceType(payloadType: string | undefined): WebhookResourceType {
  switch (payloadType) {
    case 'card':
      return 'tasks'
    case 'comment':
      return 'comments'
    default:
      return 'unknown'
  }
}

function mapAction(action: string | undefined): WebhookAction {
  switch (action) {
    case 'created':
      return 'created'
    case 'updated':
    case 'moved':
    case 'committed':
      return 'updated'
    case 'deleted':
      return 'deleted'
    default:
      return 'unknown'
  }
}

export function parseFavroWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  // Favro delivers one event per HTTP call; the body is the event.
  const payloadType = typeof payload['payloadType'] === 'string' ? payload['payloadType'] : undefined
  const action = typeof payload['action'] === 'string' ? payload['action'] : undefined
  const payloadId = typeof payload['payloadId'] === 'string' ? payload['payloadId'] : ''
  const card = payload['card'] as Record<string, unknown> | undefined
  const comment = payload['comment'] as Record<string, unknown> | undefined

  const resourceObj = card ?? comment
  // Prefer cardCommonId (stable cross-board) over cardId (widget-specific instance).
  const resourceId =
    typeof resourceObj?.['cardCommonId'] === 'string'
      ? resourceObj['cardCommonId']
      : typeof resourceObj?.['cardId'] === 'string'
        ? resourceObj['cardId']
        : typeof resourceObj?.['commentId'] === 'string'
          ? resourceObj['commentId']
          : ''

  const widgetCommonId =
    typeof resourceObj?.['widgetCommonId'] === 'string'
      ? resourceObj['widgetCommonId']
      : undefined

  return [
    {
      id: payloadId,
      platform: 'favro',
      type: `${payloadType ?? 'unknown'}.${action ?? 'unknown'}`,
      resourceType: mapResourceType(payloadType),
      action: mapAction(action),
      resourceId,
      projectId: widgetCommonId,
      payload,
    },
  ]
}

export const favroWebhook: WebhookHandler = { verifyWebhook: verifyFavroWebhook, parseWebhookEvents: parseFavroWebhookEvents }
