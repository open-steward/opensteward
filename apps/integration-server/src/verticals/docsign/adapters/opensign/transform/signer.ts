import type { Signer, SignerRole, SignerStatus } from '../../../schema/signer'
import { pickStr, strMap, toIso } from './shared'
import type { RawOpensignAuditEntry, RawOpensignDocument, RawOpensignSigner } from './envelope'

/**
 * OpenSign signers are `contracts_Contactbook` objects embedded on the
 * document. There is no per-signer status field — derive status, signedAt
 * and viewedAt from the document's AuditTrail rows keyed by UserPtr.objectId.
 */

function mapRole(userRole: string | undefined): SignerRole {
  const r = (userRole ?? '').toLowerCase()
  if (r.includes('approver')) return 'approver'
  if (r.includes('viewer')) return 'cc'
  if (r.includes('cc')) return 'cc'
  return 'signer'
}

function auditForSigner(
  signerId: string | undefined,
  auditTrail: RawOpensignAuditEntry[],
): RawOpensignAuditEntry[] {
  if (!signerId) return []
  return auditTrail.filter((a) => a.UserPtr?.objectId === signerId)
}

function statusFromAudit(
  signerId: string | undefined,
  rows: RawOpensignAuditEntry[],
  doc: RawOpensignDocument,
): SignerStatus {
  const activities = rows.map((a) => (a.Activity ?? '').toLowerCase())
  if (doc.IsDeclined && signerId && doc.DeclineBy?.objectId === signerId) return 'declined'
  if (activities.includes('declined')) return 'declined'
  if (activities.includes('signed')) return 'signed'
  if (activities.includes('viewed')) return 'delivered'
  if (doc.SignedUrl) return 'sent'
  return 'created'
}

export function transformSigner(
  raw: RawOpensignSigner,
  doc: RawOpensignDocument,
  index: number,
): Signer {
  const rows = auditForSigner(raw.objectId, doc.AuditTrail ?? [])
  const signedRow = rows.find((a) => (a.Activity ?? '').toLowerCase() === 'signed')
  const viewedRow = rows.find((a) => (a.Activity ?? '').toLowerCase() === 'viewed')

  return {
    id: pickStr(raw.objectId) ?? `${doc.objectId}:${index}`,
    externalId: pickStr(raw.objectId) ?? `${doc.objectId}:${index}`,
    envelopeId: doc.objectId,
    email: pickStr(raw.Email) ?? '',
    name: pickStr(raw.Name) ?? '',
    role: mapRole(raw.UserRole),
    status: statusFromAudit(raw.objectId, rows, doc),
    routingOrder: doc.SendinOrder ? index + 1 : undefined,
    sentAt: toIso(doc.DocSentAt),
    deliveredAt: toIso(viewedRow?.ViewedOn ?? viewedRow?.SignedOn),
    signedAt: toIso(signedRow?.SignedOn),
    platform: 'opensign',
    metadata: strMap({ phone: raw.Phone, userRole: raw.UserRole }),
    raw,
  }
}
