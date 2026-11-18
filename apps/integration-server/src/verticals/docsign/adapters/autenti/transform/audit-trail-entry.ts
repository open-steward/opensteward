import type { AuditTrailEntry, AuditTrailEventType } from '../../../schema/audit-trail-entry'
import { partyEmail, type RawAutentiParty } from './party'
import { pickStr, strMap, toIso } from './shared'

/**
 * `Event` from the Document Process API v2 OpenAPI: timestamp, id, eventType,
 * classifiers, actor (a Party), object ({ id, type }), attributes.
 */
export interface RawAutentiEvent {
  timestamp?: string
  id?: string
  eventType?: string
  classifiers?: string[]
  actor?: RawAutentiParty | null
  object?: { id?: string; type?: string } | null
  attributes?: Record<string, unknown>
  [key: string]: unknown
}

const PREFIX = 'EVENT_CLASSIFIER-UNIQUE_TYPE:'

/** The documented `EventType` values; anything else (an open pattern) is 'other'. */
const EVENT_TYPES: Record<string, AuditTrailEventType> = {
  SIGNATURE_APPLICATION: 'signed',
  SIGNATURE_REJECTION: 'declined',
  APPROVAL_CONSENT: 'other',
  APPROVAL_REJECTION: 'declined',
  REVIEW_POSITIVE: 'other',
  REVIEW_NEGATIVE: 'other',
  DOCUMENT_DRAFT_CREATED: 'created',
  DOCUMENT_SENT: 'sent',
  DOCUMENT_VIEW: 'viewed',
  DOCUMENT_WITHDRAWAL: 'voided',
  DOCUMENT_ARCHIVIZATION: 'other',
  DOCUMENT_DEARCHIVIZATION: 'other',
  DOCUMENT_PROCESS_COMPLETED: 'completed',
  HAND_OVER: 'reassigned',
  IDENTITY_VERIFICATION_STARTED: 'other',
  IDENTITY_VERIFICATION_COMPLETED: 'authenticated',
  IDENTITY_VERIFICATION_FAILURE: 'other',
  IDENTITY_VERIFICATION_REJECTION: 'other',
}

function mapEventType(t: string): AuditTrailEventType {
  return t.startsWith(PREFIX) ? (EVENT_TYPES[t.slice(PREFIX.length)] ?? 'other') : 'other'
}

export function transformAuditTrailEntry(
  raw: RawAutentiEvent,
  envelopeId: string,
): AuditTrailEntry {
  const id = pickStr(raw.id)
  if (!id) throw new Error(`Autenti event of document process ${envelopeId} has no id`)
  const occurredAt = toIso(raw.timestamp)
  if (!occurredAt) throw new Error(`Autenti event ${id} has no timestamp`)
  const eventType = pickStr(raw.eventType)
  if (!eventType) throw new Error(`Autenti event ${id} has no eventType`)
  return {
    id,
    externalId: id,
    envelopeId,
    occurredAt,
    eventType: mapEventType(eventType),
    description: eventType,
    actorId: pickStr(raw.actor?.id),
    actorEmail: partyEmail(raw.actor),
    actorName: pickStr(raw.actor?.name),
    platform: 'autenti',
    metadata: strMap({ objectId: raw.object?.id, objectType: raw.object?.type }),
    raw,
  }
}
