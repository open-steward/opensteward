import type { AuditTrailEntry, AuditTrailEventType } from '../../../schema/audit-trail-entry'
import { pickStr, strMap, toIso } from './shared'

/**
 * `GET /documents/:id/activities` returns an array of activity rows. Each row
 * has a `type`, the originating `sourceIP`, the document id, a timestamp, and
 * (for signer-bound events) a `signers` array of `{ name, email }`.
 */
export interface RawSignaturelyActivity {
  id: string
  type?: string
  sourceIP?: string | null
  signers?: Array<{ name?: string; email?: string }> | null
  documentId?: string
  createdAt?: string
  [key: string]: unknown
}

const TYPE_MAP: Record<string, AuditTrailEventType> = {
  create: 'created',
  update: 'corrected',
  send: 'sent',
  view: 'viewed',
  sign: 'signed',
  complete: 'completed',
  revert: 'voided',
  preparersign: 'signed',
}

const DESCRIPTION_MAP: Record<string, string> = {
  create: 'Document created',
  update: 'Document updated',
  send: 'Document sent to signer',
  view: 'Signer viewed the document',
  sign: 'Signer signed the document',
  complete: 'Document completed',
  revert: 'Signature request cancelled',
  preparersign: 'Preparer signed the document',
}

function mapEventType(type: string | undefined): AuditTrailEventType {
  return TYPE_MAP[(type ?? '').toLowerCase()] ?? 'other'
}

export function transformAuditTrailEntry(
  raw: RawSignaturelyActivity,
  envelopeId: string,
  index: number,
): AuditTrailEntry {
  const type = (raw.type ?? '').toLowerCase()
  const signer = raw.signers?.[0]
  // `id` (UUID) and `createdAt` (timestamp) are documented attributes of
  // every activity row; a row without them is refused, never back-filled.
  const externalId = pickStr(raw.id)
  if (!externalId) throw new Error('Signaturely activity row has no documented id')
  const occurredAt = toIso(raw.createdAt)
  if (!occurredAt) {
    throw new Error(`Signaturely activity ${externalId} has no valid createdAt`)
  }
  return {
    id: `${envelopeId}:${index}`,
    externalId,
    envelopeId,
    occurredAt,
    eventType: mapEventType(raw.type),
    description: DESCRIPTION_MAP[type] ?? type,
    actorEmail: pickStr(signer?.email),
    actorName: pickStr(signer?.name),
    actorIp: pickStr(raw.sourceIP),
    platform: 'signaturely',
    metadata: strMap({ rawType: raw.type }),
    raw,
  }
}
