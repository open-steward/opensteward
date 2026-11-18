import type { Envelope, EnvelopeStatus } from '../../../schema/envelope'
import { pickStr, strMap, toIso } from './shared'

/**
 * Signaturely's "document" is the canonical Envelope. A document carries its
 * signers inline and (when present) `parts`, each part holding one or more
 * uploaded files. The list endpoint returns the full document object per row.
 */
export interface RawSignaturelyDocumentSigner {
  id: string
  name?: string
  email?: string
  order?: number
  role?: string | null
  isPreparer?: boolean
  isReceivingReminders?: boolean
  isFinished?: boolean
  isDeclined?: boolean
  signLink?: string | null
  userId?: string
}

export interface RawSignaturelyDocument {
  id: string
  status?: string
  title?: string | null
  message?: string | null
  type?: string
  templateId?: string | null
  testMode?: boolean
  isOrdered?: boolean
  isFromFormRequest?: boolean
  filesUploaded?: boolean
  recipients?: string[] | null
  folderId?: string | null
  createdAt?: string
  updatedAt?: string
  deletedAt?: string | null
  signers?: RawSignaturelyDocumentSigner[] | null
  parts?: Array<{ id?: string; order?: number; originalFileName?: string | null }> | null
  [key: string]: unknown
}

function mapStatus(raw: string | undefined): EnvelopeStatus {
  switch ((raw ?? '').toLowerCase()) {
    case 'draft':
    case 'preparing':
      return 'draft'
    case 'awaiting':
      return 'sent'
    case 'completed':
      return 'completed'
    case 'declined':
      return 'declined'
    default:
      return 'draft'
  }
}

function signingOrder(raw: RawSignaturelyDocument): 'parallel' | 'sequential' {
  return raw.isOrdered ? 'sequential' : 'parallel'
}

export function transformEnvelope(raw: RawSignaturelyDocument): Envelope {
  const signers = [...(raw.signers ?? [])].sort(
    (a, b) => Number(a.order ?? 0) - Number(b.order ?? 0),
  )
  const status = mapStatus(raw.status)
  return {
    id: raw.id,
    externalId: raw.id,
    status,
    subject: pickStr(raw.title) ?? '',
    message: pickStr(raw.message),
    senderId: pickStr(signers.find((s) => s.isPreparer)?.userId),
    senderEmail: pickStr(signers.find((s) => s.isPreparer)?.email),
    senderName: pickStr(signers.find((s) => s.isPreparer)?.name),
    signingOrder: signingOrder(raw),
    signerIds: signers.map((s) => s.id),
    // Signaturely files live inside `parts[].files` and are not addressable as
    // standalone canonical Documents (no per-file metadata endpoint exists), so
    // the canonical document collection is left unimplemented; no ids here.
    documentIds: [],
    templateId: pickStr(raw.templateId),
    createdAt: toIso(raw.createdAt),
    completedAt: status === 'completed' ? toIso(raw.updatedAt) : undefined,
    declinedAt: status === 'declined' ? toIso(raw.updatedAt) : undefined,
    updatedAt: toIso(raw.updatedAt),
    platform: 'signaturely',
    metadata: strMap({
      type: raw.type,
      testMode: raw.testMode,
      isOrdered: raw.isOrdered,
      folderId: raw.folderId,
      rawStatus: raw.status,
    }),
    raw,
  }
}
