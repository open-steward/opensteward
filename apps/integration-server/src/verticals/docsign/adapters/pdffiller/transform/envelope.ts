import type { Envelope, EnvelopeStatus } from '../../../schema/envelope'
import { pickStr, strMap, toIso } from './shared'
import type { RawPdffillerRecipient } from './signer'

/**
 * pdfFiller signature_request → canonical Envelope. The signing document is
 * referenced by `document_id`; recipients are embedded inline. `method`
 * controls in-order vs parallel signing and is echoed by `sign_in_order`.
 */
export interface RawPdffillerSignatureRequest {
  signature_request_id?: number | string
  id?: number | string
  document_id?: number | string
  envelope_name?: string
  status?: string
  method?: string
  sign_in_order?: boolean
  security_pin?: string
  owner?: { id?: number | string; email?: string; name?: string }
  recipients?: RawPdffillerRecipient[]
  date_created?: string
  date_signed?: string
  [key: string]: unknown
}

function mapStatus(raw: string | undefined): EnvelopeStatus {
  switch ((raw ?? '').toUpperCase()) {
    case 'NOT_SENT':
      return 'draft'
    case 'SENT':
      return 'sent'
    case 'IN_PROGRESS':
      return 'delivered'
    case 'SIGNED':
    case 'COMPLETED':
      return 'completed'
    case 'REJECTED':
    case 'DECLINE':
    case 'DECLINED':
      return 'declined'
    default:
      return 'draft'
  }
}

function recipientId(r: RawPdffillerRecipient): string {
  return pickStr(r.id) ?? pickStr(r.email) ?? ''
}

export function transformEnvelope(raw: RawPdffillerSignatureRequest): Envelope {
  const id = pickStr(raw.signature_request_id ?? raw.id) ?? ''
  const recipients = raw.recipients ?? []
  const ordered = [...recipients].sort(
    (a, b) => Number(a.order ?? 0) - Number(b.order ?? 0),
  )
  const completed = mapStatus(raw.status) === 'completed'
  return {
    id,
    externalId: id,
    status: mapStatus(raw.status),
    subject: pickStr(raw.envelope_name) ?? '',
    senderId: pickStr(raw.owner?.id),
    senderEmail: pickStr(raw.owner?.email),
    senderName: pickStr(raw.owner?.name),
    signingOrder: raw.sign_in_order ? 'sequential' : 'parallel',
    signerIds: ordered.map(recipientId).filter((x) => x.length > 0),
    documentIds: raw.document_id != null ? [String(raw.document_id)] : [],
    createdAt: toIso(raw.date_created),
    completedAt: completed ? toIso(raw.date_signed) : undefined,
    platform: 'pdffiller',
    metadata: strMap({
      method: raw.method,
      signInOrder: raw.sign_in_order,
      securityPin: raw.security_pin,
      rawStatus: raw.status,
      documentId: raw.document_id,
    }),
    raw,
  }
}
