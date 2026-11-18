import type { Signer, SignerRole, SignerStatus } from '../../../schema/signer'
import { pickNum, pickStr, strMap, toIso } from './shared'

/**
 * pdfFiller signature-request recipient (embedded on the signature_request
 * payload under `recipients[]`). Recipients are always signers in pdfFiller's
 * model — there is no CC/witness distinction at the API surface.
 */
export interface RawPdffillerRecipient {
  id?: number | string
  user_id?: number | string
  email?: string
  name?: string
  order?: number | string
  status?: string
  date_created?: string
  date_signed?: string
  message_subject?: string
  message_text?: string
  access?: string
  require_photo?: boolean
  [key: string]: unknown
}

function mapRole(_access: string | undefined): SignerRole {
  // pdfFiller recipients are signers; `access` controls field-level edit
  // rights, not a distinct canonical role.
  return 'signer'
}

function mapStatus(s: string | undefined): SignerStatus {
  switch ((s ?? '').toUpperCase()) {
    case 'SIGNED':
    case 'COMPLETED':
      return 'signed'
    case 'REJECTED':
    case 'DECLINE':
    case 'DECLINED':
      return 'declined'
    case 'SENT':
    case 'IN_PROGRESS':
      return 'sent'
    case 'NOT_SENT':
      return 'created'
    default:
      return 'created'
  }
}

export function transformSigner(
  raw: RawPdffillerRecipient,
  envelopeId: string,
): Signer {
  const recipientId = pickStr(raw.id) ?? pickStr(raw.email) ?? ''
  return {
    id: `${envelopeId}:${recipientId}`,
    externalId: recipientId,
    envelopeId,
    email: pickStr(raw.email) ?? '',
    name: pickStr(raw.name) ?? '',
    role: mapRole(pickStr(raw.access)),
    status: mapStatus(raw.status),
    routingOrder: pickNum(raw.order),
    signedAt: toIso(raw.date_signed),
    platform: 'pdffiller',
    metadata: strMap({
      userId: raw.user_id,
      access: raw.access,
      requirePhoto: raw.require_photo,
      messageSubject: raw.message_subject,
      dateCreated: raw.date_created,
      rawStatus: raw.status,
    }),
    raw,
  }
}
