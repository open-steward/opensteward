import type { AuditTrailEntry, AuditTrailEventType } from '../../../schema/audit-trail-entry'
import { pickStr, strMap, toIso } from './shared'

/**
 * One element of "History Items".events at https://apidocs.scrive.com/:
 *   { "status": "initiated", "time": "2015-06-06T17:50:15Z",
 *     "party": "Not named party (1)", "text": "The signing process was initiated." }
 */
export interface RawScriveHistoryEvent {
  status?: string
  time?: string
  text?: string
  party?: string
  [key: string]: unknown
}

/** "History Items" — the body of GET /documents/{document_id}/history. */
export interface RawScriveHistory {
  events?: RawScriveHistoryEvent[]
}

/**
 * The documented `status` enum: "initiated" "draft" "cancelled" "rejected"
 * "timeouted" "problem" "deliveryproblem" "sent" "delivered" "read" "opened"
 * "signed" "prolonged" "sealed" "extended" "authenticationview"
 * "authenticated" "approved".
 */
function mapEvent(s: string | undefined): AuditTrailEventType {
  switch (s) {
    case 'initiated':
      return 'created'
    case 'sent':
    case 'delivered':
      return 'sent'
    case 'read':
    case 'opened':
      return 'viewed'
    case 'signed':
      return 'signed'
    case 'rejected':
      return 'declined'
    case 'cancelled':
      return 'voided'
    case 'timeouted':
      return 'expired'
    case 'sealed':
      return 'completed'
    case 'deliveryproblem':
      return 'delivery_failed'
    case 'authenticationview':
    case 'authenticated':
      return 'authenticated'
    case 'draft':
    case 'problem':
    case 'prolonged':
    case 'extended':
    case 'approved':
      return 'other'
    default:
      return 'unknown'
  }
}

/**
 * `index` is the event's position counted from the OLDEST event. The API
 * returns events "in reverse-chronological order", so the adapter reverses
 * them first: a new event then appends and never renumbers older ids.
 */
export function transformAuditTrailEntry(
  raw: RawScriveHistoryEvent,
  envelopeId: string,
  index: number,
): AuditTrailEntry {
  const occurredAt = toIso(raw.time)
  if (!occurredAt) {
    throw new Error(`scrive history event ${envelopeId}:${index} has no parseable "time"`)
  }
  return {
    id: `${envelopeId}:${index}`,
    externalId: `${envelopeId}:${index}`,
    envelopeId,
    occurredAt,
    eventType: mapEvent(raw.status),
    description: pickStr(raw.text) ?? '',
    actorName: pickStr(raw.party),
    platform: 'scrive',
    metadata: strMap({ status: raw.status }),
    raw,
  }
}
