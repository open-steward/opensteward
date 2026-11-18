import type { Signer, SignerStatus } from '../../../schema/signer'
import { epochToIso, pickStr, strMap } from './shared'
import type { RawDropboxSignSignatureRequest } from './envelope'

export interface RawDropboxSignSignature {
  signature_id: string
  signer_email_address?: string
  signer_name?: string
  order?: number
  status_code?: string
  signed_at?: number
  last_viewed_at?: number
  last_reminded_at?: number
  decline_reason?: string
  error?: string
  [key: string]: unknown
}

function mapStatus(code: string | undefined): SignerStatus {
  switch (code) {
    case 'signed':
      return 'signed'
    case 'declined':
      return 'declined'
    case 'awaiting_signature':
      return 'sent'
    case 'on_hold':
      return 'created'
    default:
      return 'created'
  }
}

export function transformSigner(
  raw: RawDropboxSignSignature,
  request: RawDropboxSignSignatureRequest,
): Signer {
  return {
    id: raw.signature_id,
    externalId: raw.signature_id,
    envelopeId: request.signature_request_id,
    email: pickStr(raw.signer_email_address) ?? '',
    name: pickStr(raw.signer_name) ?? '',
    role: 'signer',
    status: mapStatus(raw.status_code),
    routingOrder: raw.order != null ? raw.order + 1 : undefined,
    deliveredAt: epochToIso(raw.last_viewed_at),
    signedAt: epochToIso(raw.signed_at),
    declineReason: pickStr(raw.decline_reason),
    platform: 'dropbox-sign',
    metadata: strMap({ statusCode: raw.status_code, error: raw.error }),
    raw,
  }
}
