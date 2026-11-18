import type {
  AuditTrailEntry,
  AuditTrailEventType,
} from '../../../schema/audit-trail-entry'
import { pickStr, strMap, toIsoDatetime } from './shared'

/**
 * Secured Signing `DocumentLog` entry — returned inline on
 * `/Document/Status/{ref}?DocumentLog=true` and from `/Document/Log/{ref}`.
 * Each row records an actor (Name/Email), a free-text `Action` describing
 * what happened, and the `Date` it occurred.
 */
export interface RawSecuredSigningDocumentLog {
  Name?: string
  Email?: string
  Action?: string
  Date?: string
  GMT?: string
  [key: string]: unknown
}

/** Classify the free-text `Action` string into a canonical event type. */
function mapEventType(action: string | undefined): AuditTrailEventType {
  const a = (action ?? '').toLowerCase()
  if (a.includes('create') || a.includes('upload')) return 'created'
  if (a.includes('invit') || a.includes('sent') || a.includes('send')) return 'sent'
  if (a.includes('view') || a.includes('open')) return 'viewed'
  if (a.includes('complete')) return 'completed'
  if (a.includes('sign')) return 'signed'
  if (a.includes('declin') || a.includes('reject')) return 'declined'
  if (a.includes('void') || a.includes('delete')) return 'voided'
  if (a.includes('expire')) return 'expired'
  if (a.includes('remind')) return 'auto_reminded'
  if (a.includes('authent') || a.includes('id check') || a.includes('verif')) return 'authenticated'
  if (a.includes('fail') || a.includes('bounce')) return 'delivery_failed'
  return 'other'
}

export function transformAuditTrailEntry(
  raw: RawSecuredSigningDocumentLog,
  envelopeId: string,
  index: number,
): AuditTrailEntry {
  const occurredAt = toIsoDatetime(raw.Date) ?? new Date(0).toISOString()
  return {
    id: `${envelopeId}:${index}`,
    externalId: `${envelopeId}:${index}`,
    envelopeId,
    occurredAt,
    eventType: mapEventType(raw.Action),
    description: pickStr(raw.Action) ?? '',
    actorEmail: pickStr(raw.Email),
    actorName: pickStr(raw.Name),
    platform: 'secured-signing',
    metadata: strMap({ action: raw.Action, gmt: raw.GMT }),
    raw,
  }
}
