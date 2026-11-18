import type { Envelope, EnvelopeStatus } from '../../../schema/envelope'
import { pickStr, strMap, toIso } from './shared'

/**
 * Per-invitee record on the Details API (`data.requests[]`) — also the
 * webhook payload shape. Status is expressed as booleans plus an
 * `expiryDate`; `signType` only appears once the invitee has signed.
 */
export interface RawLeegalityInvitee {
  name?: string
  email?: string
  phone?: string
  signUrl?: string
  active?: boolean
  signed?: boolean
  rejected?: boolean
  expired?: boolean
  signType?: string
  signDate?: string
  expiryDate?: string
  creationDate?: string
  [key: string]: unknown
}

/**
 * GET /v3.0/sign/request → `data`. The document IS the envelope. `files`
 * is an array of file names; `auditTrail` is a base64 PDF blob (REFUSED —
 * never surfaced). `status` is only present on the list/search projection
 * (ListData), so the detail transform derives status from the invitee
 * booleans.
 */
export interface RawLeegalityDocument {
  documentId?: string
  irn?: string
  folderId?: string
  folderName?: string
  name?: string
  /** Only present on the list/search projection (DRAFT|SENT|RECEIVED|SIGNED|COMPLETED|EXPIRED). */
  status?: string
  requests?: RawLeegalityInvitee[]
  files?: string[]
  /** base64 PDF — REFUSED, never read. */
  auditTrail?: string
  signers?: unknown[]
  [key: string]: unknown
}

function mapWireStatus(s: string): EnvelopeStatus {
  switch (s.toLowerCase()) {
    case 'completed':
    case 'signed':
      return 'completed'
    case 'sent':
    case 'received':
      return 'sent'
    case 'expired':
      return 'expired'
    case 'draft':
      return 'draft'
    default:
      return 'draft'
  }
}

/**
 * Derive an envelope status from the invitee booleans when the wire
 * `status` field is absent (the Details API omits it).
 */
function deriveStatus(invitees: RawLeegalityInvitee[]): EnvelopeStatus {
  if (invitees.length === 0) return 'draft'
  if (invitees.some((i) => i.rejected)) return 'declined'
  if (invitees.every((i) => i.signed)) return 'completed'
  if (invitees.some((i) => i.signed)) return 'sent'
  if (invitees.every((i) => i.expired)) return 'expired'
  return 'sent'
}

export function inviteeId(
  raw: RawLeegalityInvitee,
  documentId: string,
  index: number,
): string {
  return pickStr(raw.signUrl) ?? pickStr(raw.email) ?? pickStr(raw.phone) ?? `${documentId}:${index}`
}

export function transformEnvelope(raw: RawLeegalityDocument): Envelope {
  const documentId = pickStr(raw.documentId) ?? ''
  const invitees = Array.isArray(raw.requests) ? raw.requests : []
  const status = raw.status ? mapWireStatus(raw.status) : deriveStatus(invitees)
  const completedAt =
    invitees.length > 0 && invitees.every((i) => i.signed)
      ? invitees
          .map((i) => toIso(i.signDate))
          .filter((d): d is string => typeof d === 'string')
          .sort()
          .pop()
      : undefined
  return {
    id: documentId,
    externalId: documentId,
    status,
    subject: pickStr(raw.name) ?? '',
    // Leegality invitees sign in parallel by default; there is no global
    // sequential signing-order field on the document payload.
    signingOrder: 'parallel',
    signerIds: invitees.map((inv, i) => inviteeId(inv, documentId, i)),
    documentIds:
      Array.isArray(raw.files) && raw.files.length > 0
        ? raw.files.map((_f, i) => `${documentId}:${i}`)
        : [documentId],
    completedAt,
    platform: 'leegality',
    metadata: strMap({
      irn: raw.irn,
      folderId: raw.folderId,
      folderName: raw.folderName,
      fileCount: Array.isArray(raw.files) ? raw.files.length : undefined,
    }),
    raw,
  }
}
