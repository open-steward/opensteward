import type { AuditTrailEntry, AuditTrailEventType } from '../../../schema/audit-trail-entry'
import { pickStr, strMap, toIso } from './shared'
import { packageRecipients, type RawCongaSignPackage } from './envelope'

/**
 * The Conga Sign signconnector API exposes no standalone audit endpoint; the
 * audit trail is derived from the package's lifecycle timestamps and each
 * recipient's signed/declined timestamps. Each synthesised entry is keyed by a
 * stable index so `getAuditTrailEntry("<packageId>:<index>")` round-trips.
 */
interface SynthEntry {
  eventType: AuditTrailEventType
  occurredAt: string
  description: string
  actorId?: string
  actorEmail?: string
  actorName?: string
}

function recipientName(r: { name?: string; firstName?: string; lastName?: string }): string {
  if (pickStr(r.name)) return r.name as string
  return `${r.firstName ?? ''} ${r.lastName ?? ''}`.trim()
}

/** Build the ordered audit-event list for a package, sorted oldest-first. */
export function buildAuditEntries(raw: RawCongaSignPackage): SynthEntry[] {
  const entries: SynthEntry[] = []

  const created = toIso(raw.packageCreatedOn ?? raw.created ?? raw.createdDate)
  if (created) {
    entries.push({ eventType: 'created', occurredAt: created, description: 'Package created' })
    entries.push({ eventType: 'sent', occurredAt: created, description: 'Package sent to recipients' })
  }

  for (const r of packageRecipients(raw)) {
    const name = recipientName(r)
    const signedAt = toIso(r.signedOn ?? r.signedDate)
    if (signedAt) {
      entries.push({
        eventType: 'signed',
        occurredAt: signedAt,
        description: `Recipient signed${name ? `: ${name}` : ''}`,
        actorId: pickStr(r.id),
        actorEmail: pickStr(r.email),
        actorName: name || undefined,
      })
    }
    const declinedAt = toIso(r.declinedOn)
    if (declinedAt) {
      entries.push({
        eventType: 'declined',
        occurredAt: declinedAt,
        description: `Recipient declined${name ? `: ${name}` : ''}`,
        actorId: pickStr(r.id),
        actorEmail: pickStr(r.email),
        actorName: name || undefined,
      })
    }
  }

  const completed = toIso(raw.packageCompletedOn ?? raw.completed)
  if (completed) {
    entries.push({ eventType: 'completed', occurredAt: completed, description: 'Package completed' })
  }

  return entries.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
}

export function transformAuditTrailEntry(
  entry: SynthEntry,
  envelopeId: string,
  index: number,
): AuditTrailEntry {
  return {
    id: `${envelopeId}:${index}`,
    externalId: `${envelopeId}:${index}`,
    envelopeId,
    occurredAt: entry.occurredAt,
    eventType: entry.eventType,
    description: entry.description,
    actorId: entry.actorId,
    actorEmail: entry.actorEmail,
    actorName: entry.actorName,
    platform: 'conga-sign',
    metadata: strMap({}),
    raw: entry,
  }
}
