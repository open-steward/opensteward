import type {
  AuditTrailEntry,
  AuditTrailEventType,
} from '../../../schema/audit-trail-entry'
import { pickStr, strMap, toIso } from './shared'

/**
 * SignatureAPI envelope event (`Event.EnvelopeContextEvent`), as returned by
 * `GET /envelopes/{envelopeId}/events`. Every field below is from the
 * first-party spec (https://spec.signatureapi.com/openapi.yaml):
 *  - `Event.EventBase`: `id` ("Uses the `evt_` prefix.") and `timestamp`
 *    ("When the event occurred, in ISO 8601 format."), both required;
 *  - `type`: one of `Event.TypeForEnvelope`;
 *  - `data` (`Event.EnvelopeEventData` / `RecipientEventData` /
 *    `DeliverableEventData`): `envelope_id`, `object_type`, `object_id`,
 *    `envelope_metadata`; recipient events add `recipient_type` and
 *    `recipient_key`; `recipient.accessed` adds `ip`, `user_agent` and
 *    `session_id`.
 * The spec documents no recipient name or email on an event.
 */
export interface RawSignatureapiEvent {
  id: string
  type: string
  timestamp: string
  data?: {
    envelope_id?: string
    object_type?: string
    object_id?: string
    envelope_metadata?: Record<string, unknown>
    recipient_type?: string
    recipient_key?: string
    ip?: string
    user_agent?: string
    session_id?: string
    [key: string]: unknown
  }
}

/** Map a documented `Event.TypeForEnvelope` value onto the canonical audit event type. */
function mapEventType(type: string): AuditTrailEventType {
  switch (type) {
    case 'envelope.created':
      return 'created'
    case 'envelope.started':
    case 'recipient.released':
    case 'recipient.sent':
    case 'recipient.resent':
      return 'sent'
    case 'recipient.accessed':
    case 'recipient.viewed':
      return 'viewed'
    case 'recipient.identity_verified':
      return 'authenticated'
    case 'recipient.completed':
      return 'signed'
    case 'recipient.rejected':
      return 'declined'
    case 'recipient.replaced':
      return 'reassigned'
    case 'envelope.completed':
    case 'deliverable.generated':
      return 'completed'
    case 'envelope.canceled':
      return 'voided'
    case 'recipient.soft_bounced':
    case 'recipient.hard_bounced':
    case 'recipient.failed':
      return 'delivery_failed'
    default:
      return 'other'
  }
}

export function transformAuditTrailEntry(
  raw: RawSignatureapiEvent,
  envelopeId: string,
): AuditTrailEntry {
  const occurredAt = toIso(raw.timestamp)
  if (!occurredAt) {
    throw new Error(`signatureapi event ${raw.id} has no ISO 8601 timestamp`)
  }
  const data = raw.data ?? {}
  const isRecipient = data.object_type === 'recipient'
  return {
    id: raw.id,
    externalId: raw.id,
    envelopeId,
    occurredAt,
    eventType: mapEventType(raw.type),
    description: raw.type,
    actorId: isRecipient ? pickStr(data.object_id) : undefined,
    actorIp: pickStr(data.ip),
    platform: 'signatureapi',
    metadata: strMap({
      type: raw.type,
      object_type: data.object_type,
      object_id: data.object_id,
      recipient_type: data.recipient_type,
      recipient_key: data.recipient_key,
      session_id: data.session_id,
    }),
    raw,
  }
}
