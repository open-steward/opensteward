import type { AuditTrailEntry, AuditTrailEventType } from '../../../schema/audit-trail-entry'
import { pickStr, strMap, toIso } from './shared'

/**
 * FP Sign `TraceLogEntry` — a structured audit log record returned by
 * `GET /trace-logs` (tenant-scoped). The wire object carries five fields:
 *   - `domain`      — logging subsystem (e.g. "workflow", "authentication")
 *   - `dateCreated` — ISO-ish timestamp of when the event was recorded
 *   - `message`     — human-readable description supplied by the platform
 *   - `initiator`   — user or system that triggered the event (email or id)
 *   - `target`      — the resource affected (typically a workflow/envelope id)
 *
 * There is no per-workflow filter on `GET /trace-logs`; callers must
 * filter the returned array by matching `target` to the desired envelope id.
 * The workflow-scoped audit endpoint (`GET /workflows/{id}/logs/audit`)
 * returns a PDF, not JSON, so it is unusable for structured entries.
 */
export interface RawFpSignTraceLogEntry {
  domain?: string
  dateCreated?: string
  message?: string
  initiator?: string
  target?: string
  [key: string]: unknown
}

/**
 * Map the FP Sign `domain` + `message` to the nearest canonical event type.
 * The trace log does not carry a discrete event-type enum; the `message`
 * field is a free-text string from the platform. We key off known keywords
 * and fall back to "other".
 */
function mapEventType(raw: RawFpSignTraceLogEntry): AuditTrailEventType {
  const msg = (raw.message ?? '').toLowerCase()
  const dom = (raw.domain ?? '').toLowerCase()
  if (msg.includes('created') || dom === 'create') return 'created'
  if (msg.includes('sent') || msg.includes('dispatched')) return 'sent'
  if (msg.includes('viewed') || msg.includes('opened')) return 'viewed'
  if (msg.includes('signed') || msg.includes('signature')) return 'signed'
  if (msg.includes('declined') || msg.includes('rejected')) return 'declined'
  if (msg.includes('voided') || msg.includes('cancelled') || msg.includes('canceled')) return 'voided'
  if (msg.includes('completed') || msg.includes('finished')) return 'completed'
  if (msg.includes('reminded') || msg.includes('reminder')) return 'auto_reminded'
  if (msg.includes('authenticated') || msg.includes('login') || msg.includes('auth')) return 'authenticated'
  if (msg.includes('expired')) return 'expired'
  if (msg.includes('corrected')) return 'corrected'
  if (msg.includes('reassigned')) return 'reassigned'
  return 'other'
}

export function transformAuditTrailEntry(
  raw: RawFpSignTraceLogEntry,
  envelopeId: string,
  index: number,
): AuditTrailEntry {
  const occurredAt = toIso(raw.dateCreated) ?? new Date(0).toISOString()
  // Synthesise a stable id from envelope, timestamp, and index — the wire
  // format carries no id field for trace log entries.
  const id = `audit:${envelopeId}:${occurredAt}:${index}`
  const eventType = mapEventType(raw)

  return {
    id,
    externalId: id,
    envelopeId,
    occurredAt,
    eventType,
    description: pickStr(raw.message) ?? eventType,
    // `initiator` is typically an email address or user id string.
    actorEmail: raw.initiator?.includes('@') ? raw.initiator : undefined,
    actorId: raw.initiator && !raw.initiator.includes('@') ? raw.initiator : undefined,
    platform: 'fp-sign',
    metadata: strMap({
      domain: raw.domain,
      target: raw.target,
      initiator: raw.initiator,
    }),
    raw,
  }
}
