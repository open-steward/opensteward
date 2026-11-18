import type {
  AuditTrailEntry,
  AuditTrailEventType,
} from '../../../schema/audit-trail-entry'
import { pickStr, strMap, toIso } from './shared'
import type { RawXodoSignLogEntry, RawXodoSignSigner } from './envelope'

export type { RawXodoSignLogEntry } from './envelope'

/**
 * Xodo Sign log events. The strings come straight off the document's `log`
 * array; they mirror the webhook event_type vocabulary.
 */
function mapEventType(event: string | undefined): AuditTrailEventType {
  const e = (event ?? '').toLowerCase()
  if (e.includes('created')) return 'created'
  if (e.includes('sent') || e.includes('forwarded')) return 'sent'
  if (e.includes('viewed')) return 'viewed'
  if (e.includes('signed') || e.includes('completed')) {
    return e.includes('completed') ? 'completed' : 'signed'
  }
  if (e.includes('declined')) return 'declined'
  if (e.includes('cancelled') || e.includes('revoked')) return 'voided'
  if (e.includes('expired')) return 'expired'
  if (e.includes('reminder')) return 'auto_reminded'
  if (e.includes('bounced')) return 'delivery_failed'
  return 'other'
}

export function transformAuditTrailEntry(
  raw: RawXodoSignLogEntry,
  envelopeId: string,
  index: number,
  signerById: Map<string, RawXodoSignSigner>,
): AuditTrailEntry {
  const signerKey = raw.signer != null ? String(raw.signer) : undefined
  const signer = signerKey ? signerById.get(signerKey) : undefined
  return {
    id: `${envelopeId}:${index}`,
    externalId: `${envelopeId}:${index}`,
    envelopeId,
    occurredAt: toIso(raw.timestamp) ?? new Date(0).toISOString(),
    eventType: mapEventType(raw.event),
    description: pickStr(raw.event) ?? '',
    actorId: signerKey,
    actorEmail: pickStr(signer?.email),
    actorName: pickStr(signer?.name),
    platform: 'xodo-sign',
    metadata: strMap({ event: raw.event, signer: raw.signer }),
    raw,
  }
}
