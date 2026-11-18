/**
 * Freshchat webhook verification + parsing.
 *
 * Freshchat signs webhooks with RSA SHA256:
 *   - Header: X-Freshchat-Signature (base64-encoded RSA signature)
 *   - Verified against the raw request body using the public key from settings
 *
 * Event action types:
 *   - message_create
 *   - conversation_assignment
 *   - conversation_resolution
 *   - conversation_reopen
 *
 * Docs: https://crmsupport.freshworks.com/support/solutions/articles/50000004461
 */
import { createVerify } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type { WebhookAction, WebhookEvent, WebhookResourceType } from '../../schema/webhook'

const SIG_HEADER_CANDIDATES = ['x-freshchat-signature', 'X-Freshchat-Signature']

function findHeader(headers: Record<string, string>, candidates: string[]): string | undefined {
  for (const h of candidates) {
    const v = headers[h] ?? headers[h.toLowerCase()]
    if (v) return v
  }
  return undefined
}

/**
 * Verify the Freshchat RSA-SHA256 webhook signature.
 *
 * `secret` is the PEM-encoded RSA public key provided in webhook settings.
 * Falls back to false on any error — never throws.
 */
export function verifyFreshchatWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const signature = findHeader(headers, SIG_HEADER_CANDIDATES)
    if (!signature) return false
    const sigBuffer = Buffer.from(signature.trim(), 'base64')
    // Ensure the public key is in PEM format
    const publicKey = secret.includes('BEGIN') ? secret : `-----BEGIN PUBLIC KEY-----\n${secret}\n-----END PUBLIC KEY-----`
    const verifier = createVerify('RSA-SHA256')
    verifier.update(payload)
    // Guard against degenerate empty-buffer match before verifying
    if (sigBuffer.length === 0) return false
    // RSA asymmetric verify is already constant-time from the crypto side
    const ok = verifier.verify(publicKey, sigBuffer)
    return ok
  } catch {
    return false
  }
}

const ACTION_MAP: Record<string, { resourceType: WebhookResourceType; action: WebhookAction }> = {
  message_create: { resourceType: 'messages', action: 'commented' },
  conversation_assignment: { resourceType: 'tickets', action: 'updated' },
  conversation_resolution: { resourceType: 'tickets', action: 'updated' },
  conversation_reopen: { resourceType: 'tickets', action: 'updated' },
}

export function parseFreshchatWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const action = String(payload['action'] ?? '')
  const data = (payload['data'] as Record<string, unknown> | undefined) ?? {}

  // conversation_id may be nested under data.message or data.conversation
  const message = (data['message'] as Record<string, unknown> | undefined) ?? {}
  const conversation = (data['conversation'] as Record<string, unknown> | undefined) ?? {}
  const conversationId =
    String(message['conversation_id'] ?? conversation['conversation_id'] ?? '')
  const messageId = String(message['id'] ?? '')

  const mapped = ACTION_MAP[action] ?? {
    resourceType: 'unknown' as WebhookResourceType,
    action: 'unknown' as WebhookAction,
  }

  const resourceId = mapped.resourceType === 'messages' ? messageId : conversationId

  return [
    {
      id: `freshchat:${action}:${resourceId}`,
      platform: 'freshchat',
      type: action,
      resourceType: mapped.resourceType,
      action: mapped.action,
      resourceId,
      ticketId: conversationId || undefined,
      payload,
    },
  ]
}

export const FreshchatWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyFreshchatWebhook,
  parseWebhookEvents: parseFreshchatWebhookEvents,
}
