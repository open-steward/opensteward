import type { Envelope, EnvelopeStatus } from '../../../schema/envelope'
import { pickStr, strMap, toIso } from './shared'
import type { RawCongaSignRecipient } from './signer'
import type { RawCongaSignDocument } from './document'

/**
 * A Conga Sign "transaction" is a OneSpan-powered package. The public
 * signconnector status response carries flat `package*` fields plus the nested
 * OneSpan `roles` / `documents` / `sender` blocks. Both shapes are modelled so
 * the transform reads whichever the API returns.
 */
export interface RawCongaSignPackage {
  // signconnector flat fields
  packageId?: string
  packageStatus?: string
  packageRecipients?: RawCongaSignRecipient[]
  packageCreatedOn?: string
  packageCompletedOn?: string
  packageDueDate?: string
  packageLastUpdated?: string
  senderEmail?: string
  congaOrgId?: string
  idp?: string
  idpRecordId?: string
  idpRecordType?: string
  finalDocumentSyncStatus?: string
  writebackStatus?: string
  // common identifiers / OneSpan package fields
  id?: string
  name?: string
  description?: string
  status?: string
  type?: string
  externalId?: string
  due?: string
  created?: string
  createdDate?: string
  modifiedDate?: string
  completed?: string
  sender?: { id?: string; email?: string; firstName?: string; lastName?: string }
  roles?: Array<{
    id?: string
    type?: string
    index?: number
    signers?: RawCongaSignRecipient[]
  }>
  documents?: RawCongaSignDocument[]
  [key: string]: unknown
}

/**
 * Conga Sign / OneSpan package statuses:
 * DRAFT, SENT, COMPLETED, DECLINED, EXPIRED, OPTED_OUT, ARCHIVED.
 */
function mapStatus(s: string | undefined): EnvelopeStatus {
  switch ((s ?? '').toUpperCase()) {
    case 'DRAFT':
      return 'draft'
    case 'SENT':
    case 'IN_PROGRESS':
    case 'SIGNING_PENDING':
      return 'sent'
    case 'COMPLETED':
    case 'COMPLETE':
      return 'completed'
    case 'DECLINED':
      return 'declined'
    case 'ARCHIVED':
    case 'OPTED_OUT':
    case 'CANCELLED':
      return 'voided'
    case 'EXPIRED':
      return 'expired'
    default:
      return 'draft'
  }
}

/** Flatten the recipients, whether delivered flat (`packageRecipients`) or nested under `roles[].signers`. */
export function packageRecipients(raw: RawCongaSignPackage): RawCongaSignRecipient[] {
  if (raw.packageRecipients && raw.packageRecipients.length > 0) return raw.packageRecipients
  const out: RawCongaSignRecipient[] = []
  for (const role of raw.roles ?? []) {
    for (const signer of role.signers ?? []) {
      out.push({ ...signer, role: role.type, signingOrder: role.index })
    }
  }
  return out
}

export function transformEnvelope(raw: RawCongaSignPackage): Envelope {
  const id = pickStr(raw.packageId) ?? pickStr(raw.id) ?? ''
  const recipients = packageRecipients(raw)
  const orders = recipients
    .map((r) => r.signingOrder ?? r.index)
    .filter((n): n is number => typeof n === 'number')
  const sentAt = toIso(raw.packageCreatedOn ?? raw.created ?? raw.createdDate)
  return {
    id,
    externalId: pickStr(raw.externalId) ?? id,
    status: mapStatus(raw.packageStatus ?? raw.status),
    subject: pickStr(raw.name) ?? '',
    message: pickStr(raw.description),
    senderId: pickStr(raw.sender?.id),
    senderEmail: pickStr(raw.senderEmail ?? raw.sender?.email),
    senderName:
      pickStr(raw.sender?.firstName) || pickStr(raw.sender?.lastName)
        ? `${raw.sender?.firstName ?? ''} ${raw.sender?.lastName ?? ''}`.trim()
        : undefined,
    signingOrder: new Set(orders).size > 1 ? 'sequential' : 'parallel',
    signerIds: recipients
      .map((r) => pickStr(r.id) ?? pickStr(r.email) ?? '')
      .filter((s): s is string => Boolean(s)),
    documentIds: (raw.documents ?? [])
      .map((d) => pickStr(d.id) ?? '')
      .filter((s): s is string => Boolean(s)),
    createdAt: toIso(raw.packageCreatedOn ?? raw.created ?? raw.createdDate),
    sentAt,
    completedAt: toIso(raw.packageCompletedOn ?? raw.completed),
    expiresAt: toIso(raw.packageDueDate ?? raw.due),
    updatedAt: toIso(raw.packageLastUpdated ?? raw.modifiedDate),
    platform: 'conga-sign',
    metadata: strMap({
      congaOrgId: raw.congaOrgId,
      idp: raw.idp,
      idpRecordId: raw.idpRecordId,
      idpRecordType: raw.idpRecordType,
      finalDocumentSyncStatus: raw.finalDocumentSyncStatus,
      writebackStatus: raw.writebackStatus,
      packageStatus: raw.packageStatus,
    }),
    raw,
  }
}
