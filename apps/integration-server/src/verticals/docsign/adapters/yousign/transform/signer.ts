/**
 * Yousign `Signer` → canonical Signer.
 *
 * Source: List Signature Request's Signers
 * (https://developers.youtrust.com/reference/get-signature_requests-signaturerequestid-signers-1.md),
 * whose 200 response is a bare array of `Signer`. Only documented fields are read:
 *   - `status`: "enum":["initiated","declined","notified","verified","processing",
 *     "consent_given","signed","aborted","error"]
 *   - `info`: `first_name`, `last_name`, `email`, `phone_number`, `locale`
 *   - `signed_at`: "Timestamp indicating when the Signer completed their
 *     signature. Returns null otherwise."
 *   - `recipient_stage_index`: "Position of the recipient in the signing flow.
 *     Recipients with the same index are notified simultaneously."
 *     Its base (0 or 1) is not documented, so it is kept as metadata rather
 *     than claimed as the canonical 1-indexed `routingOrder`.
 */
import type { Signer, SignerStatus } from '../../../schema/signer'
import { pickStr, strMap, toIso } from './shared'

export interface RawYousignSigner {
  id: string
  info?: {
    first_name?: string
    last_name?: string
    email?: string
    phone_number?: string | null
    locale?: string
  }
  status?: string
  signed_at?: string | null
  signature_level?: string
  signature_authentication_mode?: string | null
  delivery_mode?: string | null
  recipient_stage_index?: number
  [key: string]: unknown
}

function mapStatus(s: string | undefined): SignerStatus {
  switch (s) {
    case 'initiated':
      return 'created'
    case 'notified':
      return 'sent'
    case 'consent_given':
      return 'delivered'
    case 'signed':
      return 'signed'
    case 'declined':
      return 'declined'
    // verified, processing, aborted, error: no canonical equivalent is
    // documented; the upstream value is kept in metadata.status.
    default:
      return 'unknown'
  }
}

export function transformSigner(raw: RawYousignSigner, envelopeId: string): Signer {
  // Signer_info documents first_name and last_name as required, minLength 1.
  const name = [raw.info?.first_name, raw.info?.last_name].filter(Boolean).join(' ')
  if (!name) {
    throw new Error(`Yousign Signer ${raw.id} has no documented info.first_name or info.last_name`)
  }
  return {
    id: raw.id,
    externalId: raw.id,
    envelopeId,
    email: pickStr(raw.info?.email),
    name,
    role: 'signer',
    status: mapStatus(raw.status),
    signedAt: toIso(raw.signed_at),
    platform: 'yousign',
    metadata: strMap({
      status: raw.status,
      signatureLevel: raw.signature_level,
      authenticationMode: raw.signature_authentication_mode,
      deliveryMode: raw.delivery_mode,
      locale: raw.info?.locale,
      recipientStageIndex: raw.recipient_stage_index,
    }),
    raw,
  }
}
