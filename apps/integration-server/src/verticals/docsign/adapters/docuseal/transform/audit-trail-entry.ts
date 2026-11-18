import type {
  AuditTrailEntry,
  AuditTrailEventType,
} from '../../../schema/audit-trail-entry'
import { pickStr, strMap, toIso } from './shared'

/**
 * DocuSeal records per-submission activity under `submission_events[]`. Each
 * event has an `event_type` (e.g. `send_email`, `view_form`, `start_form`,
 * `complete_form`, `decline_form`), an `event_timestamp`, the `submitter_id`
 * it relates to, and a free-form `data` map. We normalise one event into a
 * canonical `AuditTrailEntry`. Actor email/name are resolved in `index.ts`
 * from the submitter the event references.
 */
export interface RawDocusealSubmissionEvent {
  id?: number
  submitter_id?: number
  event_type?: string
  event_timestamp?: string
  data?: Record<string, unknown>
}

function mapEventType(eventType: string | undefined): AuditTrailEventType {
  const t = (eventType ?? '').toLowerCase()
  if (t.includes('send') || t.includes('invite')) return 'sent'
  if (t.includes('view') || t.includes('open')) return 'viewed'
  if (t.includes('start')) return 'created'
  if (t.includes('complete') || t.includes('sign')) return 'signed'
  if (t.includes('decline')) return 'declined'
  if (t.includes('expire')) return 'expired'
  if (t.includes('remind')) return 'auto_reminded'
  if (t.includes('bounce') || t.includes('fail')) return 'delivery_failed'
  return 'other'
}

export interface AuditActor {
  email?: string
  name?: string
}

export function transformAuditTrailEntry(
  raw: RawDocusealSubmissionEvent,
  submissionId: string | number,
  index: number,
  actor: AuditActor = {},
): AuditTrailEntry {
  const envelopeId = String(submissionId)
  const externalId = raw.id != null ? String(raw.id) : `${envelopeId}:${index}`
  return {
    id: externalId,
    externalId,
    envelopeId,
    occurredAt: toIso(raw.event_timestamp) ?? new Date(0).toISOString(),
    eventType: mapEventType(raw.event_type),
    description: pickStr(raw.event_type) ?? '',
    actorId: raw.submitter_id != null ? String(raw.submitter_id) : undefined,
    actorEmail: pickStr(actor.email),
    actorName: pickStr(actor.name),
    platform: 'docuseal',
    metadata: strMap({
      eventType: raw.event_type,
      ...(raw.data ?? {}),
    }),
    raw,
  }
}
