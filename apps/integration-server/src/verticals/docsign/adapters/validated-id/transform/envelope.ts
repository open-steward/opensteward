import type { Envelope, EnvelopeStatus } from '../../../schema/envelope'
import { pickStr, strMap, toIso } from './shared'

/**
 * VIDsigner has no first-class "envelope" — a signing job is a single
 * document (`DocumentInfoDTO`) with one or more signers. We map that
 * document to the canonical Envelope. `DocGUI` is the stable id.
 *
 * Fields are PascalCase on the wire. The list endpoint returns lighter
 * summaries (same keys, fewer of them), so every field beyond `DocGUI`
 * is optional.
 */
export interface RawValidatedIdSignerInfo {
  SignerGUI?: string
  SignerName?: string
  SignatureStatus?: string
  RejectionReason?: string
  TypeOfID?: string
  NumberID?: string
  OperationTime?: string
  [key: string]: unknown
}

export interface RawValidatedIdDocumentInfo {
  DocGUI: string
  FileName?: string
  DocStatus?: string
  Downloaded?: boolean
  AdditionalData?: string
  Tag?: string
  IssuerName?: string
  ExpirationDate?: string
  CreationTime?: string
  CompletedTime?: string
  Signers?: RawValidatedIdSignerInfo[]
  [key: string]: unknown
}

/** DocStatus → canonical EnvelopeStatus. VIDsigner: Unsigned/Signed/Rejected. */
function mapStatus(s: string | undefined): EnvelopeStatus {
  switch ((s ?? '').toLowerCase()) {
    case 'signed':
      return 'completed'
    case 'rejected':
      return 'declined'
    case 'unsigned':
      return 'sent'
    default:
      return 'sent'
  }
}

export function transformEnvelope(raw: RawValidatedIdDocumentInfo): Envelope {
  const signers = raw.Signers ?? []
  const signerIds = signers
    .map((s) => pickStr(s.SignerGUI))
    .filter((id): id is string => typeof id === 'string')

  const status = mapStatus(raw.DocStatus)
  const completedAt = status === 'completed' ? toIso(raw.CompletedTime) : undefined
  const declinedAt = status === 'declined' ? toIso(raw.CompletedTime) : undefined

  return {
    id: raw.DocGUI,
    externalId: raw.DocGUI,
    status,
    subject: pickStr(raw.FileName) ?? '',
    senderName: pickStr(raw.IssuerName),
    signingOrder: 'sequential',
    signerIds,
    documentIds: [raw.DocGUI],
    createdAt: toIso(raw.CreationTime),
    expiresAt: toIso(raw.ExpirationDate),
    completedAt,
    declinedAt,
    platform: 'validated-id',
    metadata: strMap({
      docStatus: raw.DocStatus,
      downloaded: raw.Downloaded,
      additionalData: raw.AdditionalData,
      tag: raw.Tag,
    }),
    raw,
  }
}
