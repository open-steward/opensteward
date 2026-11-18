import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type { WebhookAction, WebhookEvent, WebhookResourceType } from '../../schema/webhook'

/**
 * ContractWorks webhook signature verification.
 *
 * When a SharedSecret is configured on the subscription, each delivery
 * includes an `x-hub-signature-256` header with value:
 *
 *   sha256=<HMAC-SHA256 hex digest of the raw JSON payload>
 *
 * This follows the same pattern as GitHub and Facebook webhooks.
 * (Ref: ContractingWorks/ClientAPI — Doc/Webhooks.md)
 */
export function verifyContractworksWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const expected = 'sha256=' + createHmac('sha256', secret).update(payload).digest('hex')
    const provided =
      headers['x-hub-signature-256'] ?? headers['X-Hub-Signature-256']
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
 * ContractWorks webhook payload structure:
 *
 * {
 *   Header: { WebhookId: string, ClientId: string, Alg: 'HS256' | 'None' },
 *   Data: Array<Record<string, unknown>>
 * }
 *
 * The WebhookId identifies the entity type and event; Data contains the
 * upserted entity objects (same shape as API responses).
 */

const ACTION_MAP: Record<string, { resourceType: WebhookResourceType; action: WebhookAction }> = {
  assignment_created: { resourceType: 'envelopes', action: 'created' },
  assignment_updated: { resourceType: 'envelopes', action: 'sent' },
  assignment_completed: { resourceType: 'envelopes', action: 'completed' },
  assignment_cancelled: { resourceType: 'envelopes', action: 'voided' },
  assignment_expired: { resourceType: 'envelopes', action: 'expired' },
  contact_signed: { resourceType: 'signers', action: 'signed' },
  contact_declined: { resourceType: 'signers', action: 'declined' },
}

export function parseContractworksWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const header = (payload['Header'] as Record<string, unknown> | undefined) ?? {}
  const webhookId = String(header['WebhookId'] ?? '')
  const clientId = String(header['ClientId'] ?? '')
  const dataItems = (payload['Data'] as unknown[] | undefined) ?? []

  return dataItems.map((item, i) => {
    const data = (item as Record<string, unknown>) ?? {}
    const envelopeId = String(
      data['assignmentId'] ?? data['assignmentIDExt'] ?? data['id'] ?? '',
    )
    const signerId = String(data['contactId'] ?? data['id'] ?? '')

    // Derive an event key from webhookId (may be a GUID or descriptive name).
    // Fall back to a generic envelope event if not in the map.
    const mapped = ACTION_MAP[webhookId.toLowerCase()] ?? {
      resourceType: 'envelopes' as WebhookResourceType,
      action: 'sent' as WebhookAction,
    }

    return {
      id: `contractworks:${webhookId}:${envelopeId}:${i}`,
      platform: 'contractworks',
      type: webhookId,
      resourceType: mapped.resourceType,
      action: mapped.action,
      resourceId:
        mapped.resourceType === 'signers' ? signerId || envelopeId : envelopeId,
      envelopeId: envelopeId || undefined,
      payload: { ...data, _clientId: clientId },
    } satisfies WebhookEvent
  })
}

export const ContractworksWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyContractworksWebhook,
  parseWebhookEvents: parseContractworksWebhookEvents,
}
