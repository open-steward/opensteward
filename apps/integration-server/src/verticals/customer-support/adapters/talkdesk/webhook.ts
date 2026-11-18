/**
 * Talkdesk Events API — webhook verification + parsing.
 *
 * Talkdesk signs webhook payloads using ECDSA (asymmetric cryptography).
 * The signature is delivered in the `X-Hub-Ecdsa-Signature` header as a
 * hex-encoded value, and the key ID is in `X-Hub-Ecdsa-Signature-Id`.
 *
 * Verification uses: SHA-512 digest, ECDSA public key (base64-encoded,
 * obtained from Talkdesk's JWKS or partner portal).
 *
 * Because verification requires the account-specific public key (not a
 * shared secret), the `secret` parameter carries the base64-encoded
 * DER public key for the account.
 *
 * Docs: https://docs.talkdesk.com/docs/events-api
 */
import { createVerify } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type { WebhookAction, WebhookEvent, WebhookResourceType } from '../../schema/webhook'

const SIG_HEADER = 'x-hub-ecdsa-signature'

/**
 * Verify a Talkdesk webhook event using ECDSA + SHA-512.
 *
 * @param payload   Raw request body buffer
 * @param headers   Request headers (case-insensitive lookup applied)
 * @param secret    Base64-encoded DER public key provided by Talkdesk
 */
export function verifyTalkdeskWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const lc = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]))
    const sigHex = lc[SIG_HEADER]
    if (!sigHex || !secret) return false

    const publicKeyDer = Buffer.from(secret, 'base64')
    const signature = Buffer.from(sigHex, 'hex')

    const verify = createVerify('SHA512')
    verify.update(payload)

    return verify.verify(
      { key: publicKeyDer, format: 'der', type: 'spki' },
      signature,
    )
  } catch {
    return false
  }
}

/**
 * Known Talkdesk event type → resource/action mappings.
 *
 * Event types follow the pattern: `<resource>.<action>` (e.g. "case.created").
 * Talkdesk triggers include: contact.created, contact.updated, note.created,
 * agent.logged_in, agent.logged_out, case.created, case.updated, case.closed.
 */
const ACTION_MAP: Record<string, { resourceType: WebhookResourceType; action: WebhookAction }> = {
  'case.created': { resourceType: 'tickets', action: 'created' },
  'case.updated': { resourceType: 'tickets', action: 'updated' },
  'case.closed': { resourceType: 'tickets', action: 'updated' },
  'case.resolved': { resourceType: 'tickets', action: 'updated' },
  'note.created': { resourceType: 'messages', action: 'commented' },
  'contact.created': { resourceType: 'contacts', action: 'created' },
  'contact.updated': { resourceType: 'contacts', action: 'updated' },
}

export function parseTalkdeskWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const type = String(payload['event_type'] ?? payload['type'] ?? '')
  const data = (payload['data'] as Record<string, unknown> | undefined) ?? {}
  const resourceId = String(data['id'] ?? payload['id'] ?? '')
  const mapped = ACTION_MAP[type] ?? {
    resourceType: 'unknown' as WebhookResourceType,
    action: 'unknown' as WebhookAction,
  }

  return [
    {
      id: `talkdesk:${type}:${resourceId}`,
      platform: 'talkdesk',
      type,
      resourceType: mapped.resourceType,
      action: mapped.action,
      resourceId,
      ticketId: mapped.resourceType === 'messages' ? String(data['case_id'] ?? '') : undefined,
      payload,
    },
  ]
}

export const TalkdeskWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyTalkdeskWebhook,
  parseWebhookEvents: parseTalkdeskWebhookEvents,
}
