import type {
  AuditTrailEntry,
  AuditTrailEventType,
} from '../../../schema/audit-trail-entry'
import { pickStr, strMap, toIso } from './shared'
import type { RawOpensignAuditEntry } from './envelope'

/**
 * OpenSign embeds the audit trail on the document as an `AuditTrail` array.
 * Each row records a signer activity (`Created`, `Viewed`, `Signed`,
 * `Declined`) with the acting `UserPtr`, an `ipAddress`, and a `SignedOn` /
 * `ViewedOn` timestamp.
 */

function mapEventType(activity: string | undefined): AuditTrailEventType {
  const a = (activity ?? '').toLowerCase()
  if (a.includes('created')) return 'created'
  if (a.includes('sent')) return 'sent'
  if (a.includes('viewed')) return 'viewed'
  if (a.includes('signed') || a.includes('completed')) return 'signed'
  if (a.includes('declined')) return 'declined'
  if (a.includes('expired')) return 'expired'
  if (a.includes('reminder') || a.includes('reminded')) return 'auto_reminded'
  return 'other'
}

export function transformAuditTrailEntry(
  raw: RawOpensignAuditEntry,
  envelopeId: string,
  index: number,
): AuditTrailEntry {
  const occurredAt =
    toIso(raw.SignedOn) ?? toIso(raw.ViewedOn) ?? new Date(0).toISOString()
  const externalId = pickStr(raw.objectId) ?? `${envelopeId}:${index}`
  return {
    id: `${envelopeId}:${externalId}`,
    externalId,
    envelopeId,
    occurredAt,
    eventType: mapEventType(raw.Activity),
    description: pickStr(raw.Activity) ?? '',
    actorId: pickStr(raw.UserPtr?.objectId),
    actorEmail: pickStr(raw.UserPtr?.Email),
    actorName: pickStr(raw.UserPtr?.Name),
    actorIp: pickStr(raw.ipAddress),
    platform: 'opensign',
    metadata: strMap({ activity: raw.Activity, ipAddress: raw.ipAddress }),
    raw,
  }
}
