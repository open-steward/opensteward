/**
 * Businessmap webhook parsing.
 *
 * Businessmap does not document an HMAC signature scheme for webhooks;
 * verification always returns true (trust-on-delivery, rely on TLS +
 * a secret-in-URL pattern if desired at the gateway level).
 *
 * Webhook payload shape (Power Automate connector docs):
 *   { company: string, event: string, user_id: number,
 *     board_id: number, card_id: number }
 *
 * Event strings examples: "Card created", "Card moved",
 *   "Card details changed", "Card deleted", "Card blocked"
 */
import type { WebhookHandler } from '@opensteward/shared'
import type { WebhookAction, WebhookEvent, WebhookResourceType } from '../../schema/webhook'

// Businessmap does not provide a signed header — verification is a no-op.
export function verifyBusinessmapWebhook(
  _payload: Buffer,
  _headers: Record<string, string>,
  _secret: string,
): boolean {
  return true
}

function mapResourceType(event: string | undefined): WebhookResourceType {
  const e = (event ?? '').toLowerCase()
  if (e.includes('card')) return 'tasks'
  if (e.includes('board')) return 'projects'
  if (e.includes('comment')) return 'comments'
  if (e.includes('user')) return 'users'
  if (e.includes('workspace')) return 'workspaces'
  return 'unknown'
}

function mapAction(event: string | undefined): WebhookAction {
  const e = (event ?? '').toLowerCase()
  if (e.includes('created') || e.includes('added')) return 'created'
  if (e.includes('deleted') || e.includes('removed') || e.includes('archived')) return 'deleted'
  if (
    e.includes('changed') ||
    e.includes('moved') ||
    e.includes('updated') ||
    e.includes('blocked') ||
    e.includes('unblocked')
  )
    return 'updated'
  return 'unknown'
}

interface BusinessmapWebhookPayload {
  company?: string
  event?: string
  user_id?: number
  board_id?: number
  card_id?: number
}

export function parseBusinessmapWebhookEvents(
  payload: Record<string, unknown>,
): WebhookEvent[] {
  const p = payload as BusinessmapWebhookPayload
  const eventStr = p.event ?? ''
  const resourceType = mapResourceType(eventStr)
  const action = mapAction(eventStr)
  const resourceId =
    resourceType === 'tasks'
      ? String(p.card_id ?? '')
      : resourceType === 'projects'
        ? String(p.board_id ?? '')
        : String(p.card_id ?? p.board_id ?? '')

  return [
    {
      id: `businessmap:${eventStr}:${resourceId}:${Date.now()}`,
      platform: 'businessmap',
      type: eventStr,
      resourceType,
      action,
      resourceId,
      projectId: p.board_id != null ? String(p.board_id) : undefined,
      payload,
    },
  ]
}

export const BusinessmapWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyBusinessmapWebhook,
  parseWebhookEvents: parseBusinessmapWebhookEvents,
}
