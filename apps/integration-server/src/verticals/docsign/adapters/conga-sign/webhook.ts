/**
 * Conga Sign callback (webhook) verification + event parsing.
 *
 * Conga Sign does not HMAC-sign callback deliveries. Instead, when you register
 * a callback URL (PUT /api/sign/callback/v1/register) you supply a callback key,
 * and every callback POST carries it back in the `Authorization` header as
 * `Basic {callbackKey}`. Verification is therefore a constant-time comparison of
 * the presented key against the configured secret.
 *
 * The callback body is a flat JSON object:
 *   { name, sessionUser, packageId, documentId, message, createdDate }
 * where `name` is the event type and `sessionUser` is the sender id (sender-
 * triggered events) or signer id (signer-triggered events).
 *
 * Docs: https://documentation.conga.com/en/sign-for-salesforce/current/conga-sign-for-rest-api-developers/setting-up-callback-notifications
 */

import { timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type { WebhookAction, WebhookEvent, WebhookResourceType } from '../../schema/webhook'

function constantTimeEquals(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8')
  const bb = Buffer.from(b, 'utf8')
  if (ab.length !== bb.length) return false
  return timingSafeEqual(ab, bb)
}

export function verifyCongaSignWebhook(
  _payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const auth = headers['authorization'] ?? headers['Authorization']
    if (!auth) return false
    const presented = auth.replace(/^Basic\s+/i, '').trim()
    if (!presented || !secret) return false
    return constantTimeEquals(presented, secret)
  } catch {
    return false
  }
}

const ACTION_MAP: Record<string, { resourceType: WebhookResourceType; action: WebhookAction }> = {
  PACKAGE_CREATE: { resourceType: 'envelopes', action: 'created' },
  PACKAGE_ACTIVATE: { resourceType: 'envelopes', action: 'sent' },
  PACKAGE_COMPLETE: { resourceType: 'envelopes', action: 'completed' },
  PACKAGE_DECLINE: { resourceType: 'envelopes', action: 'declined' },
  PACKAGE_EXPIRE: { resourceType: 'envelopes', action: 'expired' },
  PACKAGE_OPT_OUT: { resourceType: 'envelopes', action: 'voided' },
  PACKAGE_DELETE: { resourceType: 'envelopes', action: 'deleted' },
  PACKAGE_ARCHIVE: { resourceType: 'envelopes', action: 'voided' },
  PACKAGE_RESTORE: { resourceType: 'envelopes', action: 'updated' },
  SIGNER_COMPLETE: { resourceType: 'signers', action: 'signed' },
  SIGNER_LOCKED: { resourceType: 'signers', action: 'updated' },
  EMAIL_BOUNCE: { resourceType: 'signers', action: 'updated' },
  KBA_FAILURE: { resourceType: 'signers', action: 'updated' },
  DOCUMENT_SIGNED: { resourceType: 'documents', action: 'signed' },
  DOCUMENT_VIEWED: { resourceType: 'documents', action: 'viewed' },
}

export function parseCongaSignWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const name = String(payload['name'] ?? '')
  const sessionUser = String(payload['sessionUser'] ?? '')
  const packageId = String(payload['packageId'] ?? '')
  const documentId = String(payload['documentId'] ?? '')
  const createdDate = String(payload['createdDate'] ?? '')
  const { resourceType, action } = ACTION_MAP[name] ?? {
    resourceType: 'unknown' as WebhookResourceType,
    action: 'unknown' as WebhookAction,
  }
  const resourceId =
    resourceType === 'signers'
      ? sessionUser || packageId
      : resourceType === 'documents'
        ? documentId || packageId
        : packageId
  return [
    {
      id: `conga-sign:${name}:${packageId}:${documentId || sessionUser}:${createdDate}`,
      platform: 'conga-sign',
      type: name,
      resourceType,
      action,
      resourceId,
      envelopeId: packageId || undefined,
      payload,
    },
  ]
}

export const CongaSignWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyCongaSignWebhook,
  parseWebhookEvents: parseCongaSignWebhookEvents,
}
