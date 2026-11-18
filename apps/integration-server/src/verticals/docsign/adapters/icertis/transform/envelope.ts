import type { Envelope, EnvelopeStatus } from '../../../schema/envelope'
import { pickStr, strMap, toIso } from './shared'

/**
 * Icertis signatory as it appears on an agreement. ICI tracks internal team
 * members and external parties who must sign; external signatories carry an
 * email. Sign timestamps land on `SignedOn` once the party has executed.
 */
export interface RawIcertisSignatory {
  ICMId?: string
  Id?: string
  Name?: string
  Email?: string
  EmailId?: string
  SequenceNumber?: number
  SigningOrder?: number
  Status?: string
  IsExternal?: boolean
  SignedOn?: string
  DeclinedOn?: string
  [key: string]: unknown
}

/**
 * Associated document / version attached to an agreement (SOWs, annexures,
 * signed PDFs). ICI exposes these via the `AssociatedDocuments` / `Versions`
 * expand. Only metadata is surfaced — content is refused at the schema level.
 */
export interface RawIcertisAssociatedDocument {
  ICMId?: string
  Id?: string
  Name?: string
  FileName?: string
  DisplayName?: string
  FileSize?: number
  Size?: number
  PageCount?: number
  MimeType?: string
  [key: string]: unknown
}

/**
 * An Icertis Agreement entity record. ICI returns a flat attribute bag keyed
 * by the contract-type model; the fields below are the platform-standard
 * attributes common to every agreement.
 */
export interface RawIcertisAgreement {
  ICMId: string
  Id?: string
  Name?: string
  AgreementCode?: string
  Title?: string
  Status?: string
  ContractType?: string
  Description?: string
  OwnerId?: string
  OwnerEmail?: string
  OwnerName?: string
  CreatedByEmail?: string
  CreatedByName?: string
  TemplateId?: string
  EffectiveDate?: string
  ExpiryDate?: string
  CreatedOn?: string
  ModifiedOn?: string
  ExecutedOn?: string
  SubmittedOn?: string
  Signatories?: RawIcertisSignatory[]
  ExternalSignatory?: RawIcertisSignatory[]
  AssociatedDocuments?: RawIcertisAssociatedDocument[]
  Versions?: RawIcertisAssociatedDocument[]
  [key: string]: unknown
}

/** Map ICI agreement lifecycle states onto the canonical envelope status. */
function mapStatus(s: string | undefined): EnvelopeStatus {
  switch ((s ?? '').toLowerCase()) {
    case 'draft':
      return 'draft'
    case 'pending approval':
    case 'pendingapproval':
    case 'in review':
    case 'submitted':
    case 'approved':
    case 'awaiting signature':
    case 'sent for signature':
      return 'sent'
    case 'executed':
    case 'signed':
    case 'completed':
      return 'completed'
    case 'declined':
    case 'rejected':
      return 'declined'
    case 'cancelled':
    case 'canceled':
    case 'terminated':
      return 'voided'
    case 'expired':
      return 'expired'
    default:
      return 'draft'
  }
}

function signatories(raw: RawIcertisAgreement): RawIcertisSignatory[] {
  return [...(raw.Signatories ?? []), ...(raw.ExternalSignatory ?? [])]
}

function signatoryId(s: RawIcertisSignatory): string {
  return s.ICMId ?? s.Id ?? s.Email ?? s.EmailId ?? ''
}

function documentId(d: RawIcertisAssociatedDocument): string {
  return d.ICMId ?? d.Id ?? ''
}

export function transformEnvelope(raw: RawIcertisAgreement): Envelope {
  const parties = signatories(raw)
  const orders = parties.map((s) => s.SequenceNumber ?? s.SigningOrder ?? 0)
  const docs = [...(raw.AssociatedDocuments ?? []), ...(raw.Versions ?? [])]
  return {
    id: raw.ICMId,
    externalId: raw.AgreementCode ?? raw.ICMId,
    status: mapStatus(raw.Status),
    subject: pickStr(raw.Name) ?? pickStr(raw.Title) ?? '',
    message: pickStr(raw.Description),
    senderId: pickStr(raw.OwnerId),
    senderEmail: pickStr(raw.OwnerEmail) ?? pickStr(raw.CreatedByEmail),
    senderName: pickStr(raw.OwnerName) ?? pickStr(raw.CreatedByName),
    signingOrder: new Set(orders).size > 1 ? 'sequential' : 'parallel',
    signerIds: parties.map(signatoryId).filter((s): s is string => Boolean(s)),
    documentIds: docs.map(documentId).filter((s): s is string => Boolean(s)),
    templateId: pickStr(raw.TemplateId),
    createdAt: toIso(raw.CreatedOn),
    sentAt: toIso(raw.SubmittedOn),
    completedAt: toIso(raw.ExecutedOn),
    expiresAt: toIso(raw.ExpiryDate),
    updatedAt: toIso(raw.ModifiedOn),
    platform: 'icertis',
    metadata: strMap({
      contractType: raw.ContractType,
      agreementCode: raw.AgreementCode,
      effectiveDate: toIso(raw.EffectiveDate),
    }),
    raw,
  }
}
