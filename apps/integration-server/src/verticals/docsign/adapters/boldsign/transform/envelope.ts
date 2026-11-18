import type { Envelope, EnvelopeStatus } from '../../../schema/envelope'
import { epochToIso, pickStr, strMap } from './shared'

/** A signer entry as returned on the BoldSign document object. */
export interface RawBoldsignSignerDetail {
  signerName?: string
  signerEmail?: string
  signerRole?: string
  status?: string
  order?: number
  signerType?: string
  signedDate?: number
  declineMessage?: string
  isViewed?: boolean
  isReassigned?: boolean
  authenticationType?: string
  [key: string]: unknown
}

/** A file entry as returned on the BoldSign document properties object. */
export interface RawBoldsignFile {
  documentName?: string
  fileName?: string
  pageCount?: number
  [key: string]: unknown
}

/**
 * BoldSign document object, returned by both `/v1/document/list` (slimmer) and
 * `/v1/document/properties` (full, with `files` + `documentDescription`). A
 * document IS the canonical envelope — there is no separate envelope resource.
 */
export interface RawBoldsignDocument {
  documentId: string
  messageTitle?: string
  documentDescription?: string
  status?: string
  senderDetail?: { name?: string; emailAddress?: string; userId?: string }
  ccDetails?: Array<{ emailAddress?: string; name?: string }>
  signerDetails?: RawBoldsignSignerDetail[]
  enableSigningOrder?: boolean
  createdDate?: number
  activityDate?: number
  expiryDate?: number
  files?: RawBoldsignFile[]
  labels?: string[]
  templateId?: string
  isDeleted?: boolean
  revokeMessage?: string
  [key: string]: unknown
}

function mapStatus(raw: string | undefined): EnvelopeStatus {
  const s = (raw ?? '').toLowerCase()
  if (s === 'completed') return 'completed'
  if (s === 'declined') return 'declined'
  if (s === 'revoked') return 'voided'
  if (s === 'expired') return 'expired'
  if (s === 'draft') return 'draft'
  // InProgress / WaitingForOthers / WaitingForMe / Sent → in flight
  if (s === 'inprogress' || s.startsWith('waiting') || s === 'sent' || s === 'inflight') return 'sent'
  return 'sent'
}

function signingOrder(raw: RawBoldsignDocument): 'parallel' | 'sequential' {
  if (raw.enableSigningOrder) return 'sequential'
  const orders = (raw.signerDetails ?? []).map((s) => Number(s.order ?? 0))
  return new Set(orders).size > 1 ? 'sequential' : 'parallel'
}

/** Stable signer id within an envelope: `<documentId>:<email>`. */
export function signerExternalId(documentId: string, signer: RawBoldsignSignerDetail): string {
  return `${documentId}:${signer.signerEmail ?? signer.signerName ?? 'unknown'}`
}

export function transformEnvelope(raw: RawBoldsignDocument): Envelope {
  const sortedSigners = [...(raw.signerDetails ?? [])].sort(
    (a, b) => Number(a.order ?? 0) - Number(b.order ?? 0),
  )
  const status = mapStatus(raw.status)
  return {
    id: raw.documentId,
    externalId: raw.documentId,
    status,
    subject: pickStr(raw.messageTitle) ?? '',
    message: pickStr(raw.documentDescription),
    senderId: pickStr(raw.senderDetail?.userId),
    senderEmail: pickStr(raw.senderDetail?.emailAddress),
    senderName: pickStr(raw.senderDetail?.name),
    signingOrder: signingOrder(raw),
    signerIds: sortedSigners.map((s) => signerExternalId(raw.documentId, s)),
    // BoldSign exposes files only on the properties endpoint; the canonical
    // documentId is the file's `documentName`. The list shape omits them.
    documentIds: (raw.files ?? []).map(
      (f, i) => `${raw.documentId}:${i}`,
    ),
    templateId: pickStr(raw.templateId),
    createdAt: epochToIso(raw.createdDate),
    expiresAt: epochToIso(raw.expiryDate),
    updatedAt: epochToIso(raw.activityDate),
    completedAt: status === 'completed' ? epochToIso(raw.activityDate) : undefined,
    declinedAt: status === 'declined' ? epochToIso(raw.activityDate) : undefined,
    voidedAt: status === 'voided' ? epochToIso(raw.activityDate) : undefined,
    platform: 'boldsign',
    metadata: strMap({
      ...(raw.labels && raw.labels.length > 0 ? { labels: raw.labels.join(',') } : {}),
      ...(raw.revokeMessage ? { revokeMessage: raw.revokeMessage } : {}),
      ...(raw.isDeleted != null ? { isDeleted: raw.isDeleted } : {}),
    }),
    raw,
  }
}
