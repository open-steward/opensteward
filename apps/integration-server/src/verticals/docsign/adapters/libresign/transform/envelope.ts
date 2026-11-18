import type { Envelope, EnvelopeStatus } from '../../../schema/envelope'
import { pickNum, pickStr, strMap, toIso } from './shared'
import { FILE_STATUS } from '../constants'
import type { RawLibreSignSigner } from './signer'

/**
 * A LibreSign "file" IS the canonical envelope: it bundles the PDF, the
 * sign-requests (signers), and the workflow status. Shared by the
 * `file/list` summary shape and the richer `file/validate` (`ValidatedFile`)
 * detail shape, so optional fields cover both.
 */
export interface RawLibreSignFile {
  id?: number
  fileId?: number
  uuid?: string
  name?: string
  status?: number
  statusText?: string
  nodeId?: number | null
  /** ISO-8601 creation timestamp on the validate response. */
  created_at?: string
  /** `none` | `parallel` | `ordered_numeric`. */
  signatureFlow?: string
  /** The Nextcloud user who requested signatures. */
  requested_by?: { userId?: string; displayName?: string | null }
  signers?: RawLibreSignSigner[]
  signersCount?: number
  size?: number
  totalPages?: number
  mime?: string
  pdfVersion?: string
  /** URL string to the file (no inline content is ever read). */
  file?: string
  url?: string
  metadata?: Record<string, unknown>
  [key: string]: unknown
}

/**
 * Map a LibreSign file status integer to the canonical envelope status.
 *   0 draft → draft
 *   1 able to sign → sent (out for signature)
 *   2 partially signed → delivered (in progress, at least one signed)
 *   3 signed → completed
 *   4 deleted → voided
 * Any other value is not one `file-list` documents for `status[]`, so it is
 * `unknown` rather than a guessed status.
 */
function mapStatus(status: number | undefined): EnvelopeStatus {
  switch (status) {
    case FILE_STATUS.DRAFT:
      return 'draft'
    case FILE_STATUS.ABLE_TO_SIGN:
      return 'sent'
    case FILE_STATUS.PARTIAL_SIGNED:
      return 'delivered'
    case FILE_STATUS.SIGNED:
      return 'completed'
    case FILE_STATUS.DELETED:
      return 'voided'
    default:
      return 'unknown'
  }
}

/** LibreSign `signatureFlow` → canonical signing order. */
function mapSigningOrder(flow: string | undefined): 'parallel' | 'sequential' {
  return flow === 'ordered_numeric' ? 'sequential' : 'parallel'
}

/**
 * Signer id, the same one transformSigner emits: `signRequestId`, which
 * `SignerSummary` (and `SignerDetail`, via allOf) lists as required.
 */
function signerId(envelopeId: string, s: RawLibreSignSigner): string {
  const id = pickStr(s.signRequestId)
  if (id === undefined)
    throw new Error(`LibreSign signer on file ${envelopeId} has no signRequestId`)
  return id
}

export function transformEnvelope(raw: RawLibreSignFile): Envelope {
  // `uuid` is required on FileSummary, DetailedFile and ValidatedFile, and it is
  // the key `file/validate/uuid/{uuid}` reads back (LibreSign openapi.json).
  const id = pickStr(raw.uuid)
  if (id === undefined) throw new Error('LibreSign file has no uuid')
  const signers = raw.signers ?? []
  // The latest sign timestamp across signers stands in for completion.
  const signDates = signers
    .map((s) => toIso(s.sign_date ?? s.signed))
    .filter((d): d is string => typeof d === 'string')
    .sort()
  const completedAt =
    raw.status === FILE_STATUS.SIGNED && signDates.length > 0
      ? signDates[signDates.length - 1]
      : undefined
  return {
    id,
    externalId: id,
    status: mapStatus(raw.status),
    subject: pickStr(raw.name) ?? '',
    senderId: pickStr(raw.requested_by?.userId),
    senderName: pickStr(raw.requested_by?.displayName),
    signingOrder: mapSigningOrder(raw.signatureFlow),
    signerIds: signers.map((s) => signerId(id, s)),
    documentIds: [id],
    createdAt: toIso(raw.created_at),
    completedAt,
    platform: 'libresign',
    metadata: strMap({
      statusText: raw.statusText,
      signatureFlow: raw.signatureFlow,
      nodeId: raw.nodeId,
      signersCount: raw.signersCount ?? signers.length,
      totalPages: raw.totalPages,
      mime: raw.mime,
      pdfVersion: raw.pdfVersion,
      sizeBytes: pickNum(raw.size),
    }),
    raw,
  }
}
