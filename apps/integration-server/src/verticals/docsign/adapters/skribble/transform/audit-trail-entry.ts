import type {
  AuditTrailEntry,
  AuditTrailEventType,
} from '../../../schema/audit-trail-entry'
import { pickStr, strMap, toIso } from './shared'
import type { RawSkribbleSignature } from './signer'

/**
 * Skribble does not expose a dedicated audit-trail endpoint — the
 * compliance evidence lives on the qualified signature certificate
 * embedded in the signed PDF. We synthesise canonical AuditTrailEntry
 * rows from the per-signer timestamps on the signature_request response.
 */

interface SyntheticEvent {
  kind: 'notified' | 'viewed' | 'signed' | 'declined'
  at: string
  signer: RawSkribbleSignature
}

function mapKind(k: SyntheticEvent['kind']): AuditTrailEventType {
  switch (k) {
    case 'notified':
      return 'sent'
    case 'viewed':
      return 'viewed'
    case 'signed':
      return 'signed'
    case 'declined':
      return 'declined'
  }
}

export function synthesiseAuditEvents(
  signatures: RawSkribbleSignature[] | undefined,
): SyntheticEvent[] {
  const out: SyntheticEvent[] = []
  for (const s of signatures ?? []) {
    if (s.notified_at) out.push({ kind: 'notified', at: s.notified_at, signer: s })
    if (s.viewed_at) out.push({ kind: 'viewed', at: s.viewed_at, signer: s })
    if (s.signed_at) out.push({ kind: 'signed', at: s.signed_at, signer: s })
    if (s.declined_at) out.push({ kind: 'declined', at: s.declined_at, signer: s })
  }
  out.sort((a, b) => a.at.localeCompare(b.at))
  return out
}

export function transformAuditTrailEntry(
  ev: SyntheticEvent,
  envelopeId: string,
  index: number,
): AuditTrailEntry {
  const name = [
    ev.signer.signer_identity_data?.first_name,
    ev.signer.signer_identity_data?.last_name,
  ]
    .filter(Boolean)
    .join(' ')
  return {
    id: `${envelopeId}:${index}`,
    externalId: `${envelopeId}:${index}`,
    envelopeId,
    occurredAt: toIso(ev.at) ?? new Date(0).toISOString(),
    eventType: mapKind(ev.kind),
    description: ev.kind,
    actorId: pickStr(ev.signer.sid),
    actorEmail:
      pickStr(ev.signer.signer_identity_data?.email_address) ??
      pickStr(ev.signer.account_email),
    actorName: name || undefined,
    platform: 'skribble',
    metadata: strMap({ kind: ev.kind }),
    raw: ev,
  }
}
