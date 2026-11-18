import type { Envelope, EnvelopeStatus } from '../../../schema/envelope'
import { pickStr, strMap, toIso } from './shared'
import type { RawDochubFlatSignRequest } from './sign-request'

/**
 * DocHub "sign request" — the document(s) sent to one or more recipients
 * for signature. Maps onto the canonical Envelope. Recipients are inlined
 * on the sign request; documents are referenced by id.
 */
export interface RawDochubSignRequest {
  id: string
  title?: string
  subject?: string
  message?: string
  status?: string
  sender?: { id?: string; email?: string; name?: string }
  signing_order?: string
  ordered?: boolean
  recipients?: Array<{
    id?: string
    email?: string
    name?: string
    order?: number
  }>
  documents?: Array<{ id?: string }>
  template_id?: string
  created_at?: string
  sent_at?: string
  viewed_at?: string
  completed_at?: string
  declined_at?: string
  canceled_at?: string
  voided_at?: string
  expires_at?: string
  updated_at?: string
  cancel_reason?: string
  metadata?: Record<string, unknown>
  [key: string]: unknown
}

function mapStatus(raw: string | undefined): EnvelopeStatus {
  const s = (raw ?? '').toLowerCase()
  if (s === 'draft' || s === 'created') return 'draft'
  if (s === 'sent' || s === 'pending' || s === 'awaiting_signature') return 'sent'
  if (s === 'viewed' || s === 'delivered' || s === 'opened') return 'delivered'
  if (s === 'completed' || s === 'signed' || s === 'finished') return 'completed'
  if (s === 'declined' || s === 'rejected') return 'declined'
  if (s === 'voided' || s === 'canceled' || s === 'cancelled') return 'voided'
  if (s === 'expired') return 'expired'
  return 'draft'
}

function signerIds(raw: RawDochubSignRequest): string[] {
  return [...(raw.recipients ?? [])]
    .sort((a, b) => Number(a.order ?? 0) - Number(b.order ?? 0))
    .map((r) => pickStr(r.id) ?? '')
    .filter((id) => id.length > 0)
}

function signingOrder(raw: RawDochubSignRequest): 'parallel' | 'sequential' {
  if (raw.signing_order === 'sequential' || raw.ordered === true) return 'sequential'
  if (raw.signing_order === 'parallel' || raw.ordered === false) return 'parallel'
  const orders = (raw.recipients ?? []).map((r) => Number(r.order ?? 0))
  return new Set(orders).size > 1 ? 'sequential' : 'parallel'
}

export function transformEnvelope(raw: RawDochubSignRequest): Envelope {
  return {
    id: raw.id,
    externalId: raw.id,
    status: mapStatus(raw.status),
    subject: raw.subject ?? raw.title ?? '',
    message: pickStr(raw.message),
    senderId: pickStr(raw.sender?.id),
    senderEmail: pickStr(raw.sender?.email),
    senderName: pickStr(raw.sender?.name),
    signingOrder: signingOrder(raw),
    signerIds: signerIds(raw),
    documentIds: (raw.documents ?? [])
      .map((d) => pickStr(d.id) ?? '')
      .filter((id) => id.length > 0),
    templateId: pickStr(raw.template_id),
    createdAt: toIso(raw.created_at),
    sentAt: toIso(raw.sent_at),
    deliveredAt: toIso(raw.viewed_at),
    completedAt: toIso(raw.completed_at),
    declinedAt: toIso(raw.declined_at),
    voidedAt: toIso(raw.voided_at ?? raw.canceled_at),
    expiresAt: toIso(raw.expires_at),
    updatedAt: toIso(raw.updated_at),
    platform: 'dochub',
    metadata: {
      ...strMap(raw.metadata),
      ...(raw.cancel_reason ? { cancelReason: raw.cancel_reason } : {}),
    },
    raw,
  }
}

/**
 * DocHub's documented `sign_request_flat_resource.status` enum:
 * IN_PROGRESS, FINALIZED, REJECTED, ERROR, BOUNCE, VOIDED, EXPIRED, PREPARING.
 * - PREPARING: "Sends a sign request draft that is currently in PREPARING status."
 * - IN_PROGRESS: sent and awaiting signers ("Voids an in-progress sign request").
 * - VOIDED: void's "status becomes `VOIDED`".
 * ERROR and BOUNCE carry no documented meaning for the envelope as a whole,
 * so they are `unknown`; the raw value is always kept in `metadata.status`.
 */
function mapFlatStatus(raw: string | undefined): EnvelopeStatus {
  switch (raw) {
    case 'PREPARING':
      return 'draft'
    case 'IN_PROGRESS':
      return 'sent'
    case 'FINALIZED':
      return 'completed'
    case 'REJECTED':
      return 'declined'
    case 'VOIDED':
      return 'voided'
    case 'EXPIRED':
      return 'expired'
    default:
      return 'unknown'
  }
}

/**
 * Maps DocHub's documented flat sign request (`sign_request_flat_resource`,
 * the `application/json` body of GET /api/v2/sign-requests/{id} and of
 * POST /api/v2/sign-requests/{id}/void) onto the canonical Envelope.
 */
export function transformFlatEnvelope(raw: RawDochubFlatSignRequest): Envelope {
  const metadata: Record<string, string> = {}
  if (typeof raw.status === 'string') metadata.status = raw.status
  const body = raw.emailContent?.body
  return {
    id: raw.id,
    externalId: raw.id,
    status: mapFlatStatus(raw.status),
    // `emailContent`: "Email content sent to signers"; nullable.
    subject: raw.emailContent?.subject ?? '',
    ...(typeof body === 'string' && body.length > 0 ? { message: body } : {}),
    // `userId`: "ID of the user who created the sign request".
    senderId: pickStr(raw.userId),
    // `hasQueue`: "Whether signing is configured sequentially (queue mode)".
    signingOrder: raw.hasQueue === true ? 'sequential' : 'parallel',
    // `signers`: "Array of signer IDs assigned to this sign request", and
    // `documentId`: "ID of the associated document". Both are emitted in the
    // `<signRequestId>:<id>` form this adapter's Signer and Document ids
    // take, so they resolve with getSigner / getDocument.
    signerIds: (raw.signers ?? []).map((s) => `${raw.id}:${s}`),
    documentIds: raw.documentId ? [`${raw.id}:${raw.documentId}`] : [],
    createdAt: toIso(raw.createdAt),
    updatedAt: toIso(raw.updatedAt),
    platform: 'dochub',
    metadata,
    raw,
  }
}
