import type { AuditTrailEntry, AuditTrailEventType } from '../../../schema/audit-trail-entry'
import { pickStr, toIso } from './shared'

/**
 * One row of `GET /document/{document_hash}/audit_log`.
 *
 * Every field is from the "Audit Log" API Response Objects table at
 * https://eversign.com/api/documentation/methods. The example response sends
 * `entry_id` as a number and `time_stamp` / `event_assoc_signer` as strings.
 */
export interface RawEversignAuditLogEntry {
  /** "Unique database ID of this log" */
  entry_id?: number | string
  /** "The event name identifier" */
  event_type?: string
  /** "Signer's number for this document" */
  event_assoc_signer?: string | number
  /** "Signer's full name" */
  event_assoc_signer_name?: string
  /** "Signer's email address" */
  event_assoc_signer_email?: string
  event_assoc_signer_additional_data?: Record<string, unknown>
  /** "Unix time of the occurring event" */
  time_stamp?: string | number
  /** "Data integrity value for this document" */
  document_checksum?: string
  /** "Combined checksum based on event_type, time_stamp and document_checksum" */
  combined_checksum?: string
  /** "IP address of the client for a set of actions performed by a client" */
  client_ip?: string
  /** "IP address of the signer (if signing)" */
  signer_ip?: string
  /** "Checksum of the document's file after it has been modified (signed)" */
  merged_document_file_checksum?: string
}

/**
 * The documented "Document Event Values" (Get Document / Template section of
 * https://eversign.com/api/documentation/methods), with their documented
 * descriptions, plus `signer_bounced` named in the Audit Log table.
 */
const EVENT_DESCRIPTIONS: Record<string, string> = {
  document_created: 'Document has been created',
  document_edited: 'Document has been edited',
  document_completed: 'Document has been completed',
  document_sent: 'Document has been sent',
  document_restored: 'Document has been restored from trash',
  document_cancelled: 'Document has been cancelled',
  document_trashed: 'Document has been trashed',
  document_archived: 'Document has been archived',
  document_unarchived: 'Document has been unarchived',
  document_deleted: 'Document has been deleted',
  document_expired: 'Document has expired',
  document_viewed: 'Document has been opened/viewed',
  document_declined: 'Document has been declined',
  document_signed: 'Document has been signed by a signer',
}

const EVENT_TYPES: Record<string, AuditTrailEventType> = {
  document_created: 'created',
  document_sent: 'sent',
  document_viewed: 'viewed',
  document_signed: 'signed',
  document_declined: 'declined',
  document_completed: 'completed',
  document_cancelled: 'voided',
  document_expired: 'expired',
  signer_bounced: 'delivery_failed',
}

/** Own-key lookup, so a vendor value such as 'constructor' cannot reach Object.prototype. */
function ownValue<T>(map: Record<string, T>, key: string): T | undefined {
  return Object.hasOwn(map, key) ? map[key] : undefined
}

function nonEmpty(v: unknown): string | undefined {
  const s = pickStr(v)
  return s === undefined || s === '' ? undefined : s
}

export function transformAuditTrailEntry(
  raw: RawEversignAuditLogEntry,
  envelopeId: string,
): AuditTrailEntry {
  const entryId = nonEmpty(raw.entry_id)
  if (!entryId) throw new Error('eversign audit log entry has no entry_id')
  const occurredAt = toIso(raw.time_stamp)
  if (!occurredAt) throw new Error(`eversign audit log entry ${entryId} has no time_stamp`)
  const eventType = nonEmpty(raw.event_type)

  const metadata: Record<string, string> = {}
  for (const key of [
    'event_type',
    'document_checksum',
    'combined_checksum',
    'signer_ip',
    'merged_document_file_checksum',
  ] as const) {
    const v = nonEmpty(raw[key])
    if (v !== undefined) metadata[key] = v
  }

  return {
    id: `${envelopeId}:${entryId}`,
    externalId: entryId,
    envelopeId,
    occurredAt,
    eventType: (eventType && ownValue(EVENT_TYPES, eventType)) || 'other',
    description: (eventType && ownValue(EVENT_DESCRIPTIONS, eventType)) || eventType || '',
    actorId: nonEmpty(raw.event_assoc_signer),
    actorEmail: nonEmpty(raw.event_assoc_signer_email),
    actorName: nonEmpty(raw.event_assoc_signer_name),
    actorIp: nonEmpty(raw.client_ip),
    platform: 'eversign',
    metadata,
    raw,
  }
}
