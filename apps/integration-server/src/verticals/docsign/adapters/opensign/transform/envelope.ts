import type { Envelope, EnvelopeStatus } from '../../../schema/envelope'
import { pickStr, strMap, toIso } from './shared'

/** Signer entry embedded on a document — a `contracts_Contactbook` object. */
export interface RawOpensignSigner {
  objectId?: string
  Name?: string
  Email?: string
  Phone?: string
  UserRole?: string
  [key: string]: unknown
}

/** Audit-trail row embedded on a document. */
export interface RawOpensignAuditEntry {
  objectId?: string
  Activity?: string
  ipAddress?: string
  SignedOn?: unknown
  ViewedOn?: unknown
  UserPtr?: { objectId?: string; Name?: string; Email?: string }
  [key: string]: unknown
}

/**
 * `contracts_Document` — OpenSign's signature-request object. Fields mirror
 * the Parse class returned by GET /document/:id and /documentlist/:reportId.
 */
export interface RawOpensignDocument {
  objectId: string
  Name?: string
  Note?: string
  Description?: string
  URL?: string
  SignedUrl?: string
  CertificateUrl?: string
  IsCompleted?: boolean
  IsDeclined?: boolean
  IsSignyourself?: boolean
  IsArchive?: boolean
  SendinOrder?: boolean
  SentToOthers?: boolean
  DeclineReason?: string
  ExpiryDate?: unknown
  DocSentAt?: unknown
  TimeToCompleteDays?: number
  TemplateId?: string
  SenderName?: string
  SenderMail?: string
  Signers?: RawOpensignSigner[]
  Placeholders?: Array<{ Id?: string | number; signerObjId?: string }>
  AuditTrail?: RawOpensignAuditEntry[]
  ExtUserPtr?: { objectId?: string; Name?: string; Email?: string; Company?: string }
  CreatedBy?: { objectId?: string }
  DeclineBy?: { objectId?: string }
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

/**
 * OpenSign represents state with boolean flags rather than a status string.
 * Resolve the canonical status from those flags + the audit trail.
 */
function mapStatus(raw: RawOpensignDocument): EnvelopeStatus {
  if (raw.IsDeclined) return 'declined'
  if (raw.IsCompleted) return 'completed'

  const expiry = toIso(raw.ExpiryDate)
  if (expiry && Date.parse(expiry) < Date.now()) return 'expired'

  const activities = (raw.AuditTrail ?? []).map((a) => (a.Activity ?? '').toLowerCase())
  if (activities.includes('signed') || activities.includes('viewed')) return 'delivered'

  // SignedUrl is set once the request has been sent for signature.
  if (raw.SignedUrl) return 'sent'
  return 'draft'
}

function signingOrder(raw: RawOpensignDocument): 'parallel' | 'sequential' {
  return raw.SendinOrder ? 'sequential' : 'parallel'
}

function signerIds(raw: RawOpensignDocument): string[] {
  return (raw.Signers ?? [])
    .map((s) => s.objectId)
    .filter((id): id is string => typeof id === 'string')
}

function documentIds(raw: RawOpensignDocument): string[] {
  // A document carries a single PDF; address it by the envelope id.
  return raw.objectId ? [raw.objectId] : []
}

/** Timestamp of the latest "Signed" audit activity, used as completedAt. */
function completedAt(raw: RawOpensignDocument): string | undefined {
  if (!raw.IsCompleted) return undefined
  const signed = (raw.AuditTrail ?? [])
    .filter((a) => (a.Activity ?? '').toLowerCase() === 'signed')
    .map((a) => toIso(a.SignedOn))
    .filter((t): t is string => typeof t === 'string')
    .sort()
  return signed[signed.length - 1] ?? toIso(raw.updatedAt)
}

export function transformEnvelope(raw: RawOpensignDocument): Envelope {
  return {
    id: raw.objectId,
    externalId: raw.objectId,
    status: mapStatus(raw),
    subject: pickStr(raw.Name) ?? '',
    message: pickStr(raw.Note) ?? pickStr(raw.Description),
    senderId: pickStr(raw.ExtUserPtr?.objectId) ?? pickStr(raw.CreatedBy?.objectId),
    senderEmail: pickStr(raw.SenderMail) ?? pickStr(raw.ExtUserPtr?.Email),
    senderName: pickStr(raw.SenderName) ?? pickStr(raw.ExtUserPtr?.Name),
    signingOrder: signingOrder(raw),
    signerIds: signerIds(raw),
    documentIds: documentIds(raw),
    templateId: pickStr(raw.TemplateId),
    createdAt: toIso(raw.createdAt),
    sentAt: toIso(raw.DocSentAt),
    completedAt: completedAt(raw),
    declinedAt: raw.IsDeclined ? toIso(raw.updatedAt) : undefined,
    expiresAt: toIso(raw.ExpiryDate),
    updatedAt: toIso(raw.updatedAt),
    platform: 'opensign',
    metadata: strMap({
      isSignyourself: raw.IsSignyourself,
      sendToOthers: raw.SentToOthers,
      timeToCompleteDays: raw.TimeToCompleteDays,
      declineReason: raw.DeclineReason,
      company: raw.ExtUserPtr?.Company,
    }),
    raw,
  }
}
