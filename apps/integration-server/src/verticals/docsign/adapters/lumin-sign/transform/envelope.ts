import type { Envelope, EnvelopeStatus } from '../../../schema/envelope'
import { pickStr, strMap, toIso } from './shared'

/**
 * Lumin Sign signature request. Timestamps (`created_at`, `updated_at`,
 * `expires_at`) are Unix-epoch milliseconds in practice; the OpenAPI schema
 * types them loosely as strings, so we accept both via `toIso`.
 */
export interface RawLuminSignSignatureRequest {
  signature_request_id: string
  title?: string
  status?: string
  reason?: string
  signing_type?: string
  details_url?: string
  created_at?: string | number
  updated_at?: string | number
  expires_at?: string | number
  signers?: RawLuminSignEmbeddedSigner[]
  [key: string]: unknown
}

export interface RawLuminSignEmbeddedSigner {
  email_address?: string
  name?: string
  group?: number
  is_approved?: boolean
  status?: string
  [key: string]: unknown
}

/**
 * Map Lumin's request status to the canonical envelope status.
 *
 *   NEED_TO_SIGN / WAITING_FOR_OTHERS / WAITING_FOR_PROCESSING → sent
 *   APPROVED                                                   → completed
 *   REJECTED / FAILED                                          → declined
 *   CANCELLED                                                  → voided
 */
function mapStatus(raw: string | undefined): EnvelopeStatus {
  switch ((raw ?? '').toUpperCase()) {
    case 'NEED_TO_SIGN':
    case 'WAITING_FOR_OTHERS':
    case 'WAITING_FOR_PROCESSING':
      return 'sent'
    case 'APPROVED':
      return 'completed'
    case 'REJECTED':
    case 'FAILED':
      return 'declined'
    case 'CANCELLED':
      return 'voided'
    default:
      return 'sent'
  }
}

function mapSigningOrder(signingType: string | undefined): 'parallel' | 'sequential' {
  return (signingType ?? '').toUpperCase() === 'ORDER' ? 'sequential' : 'parallel'
}

/** Lumin signers have no stable id; address them by email within the request. */
function signerIds(raw: RawLuminSignSignatureRequest): string[] {
  return (raw.signers ?? [])
    .map((s) => s.email_address)
    .filter((e): e is string => typeof e === 'string' && e.length > 0)
}

export function transformEnvelope(raw: RawLuminSignSignatureRequest): Envelope {
  const status = mapStatus(raw.status)
  const completedAt = status === 'completed' ? toIso(raw.updated_at) : undefined
  const declinedAt = status === 'declined' ? toIso(raw.updated_at) : undefined
  const voidedAt = status === 'voided' ? toIso(raw.updated_at) : undefined
  return {
    id: raw.signature_request_id,
    externalId: raw.signature_request_id,
    status,
    subject: pickStr(raw.title) ?? '',
    signingOrder: mapSigningOrder(raw.signing_type),
    signerIds: signerIds(raw),
    // Lumin's signature-request response carries no per-document ids or a
    // source template id; both arrays stay empty / undefined.
    documentIds: [],
    createdAt: toIso(raw.created_at),
    completedAt,
    declinedAt,
    voidedAt,
    expiresAt: toIso(raw.expires_at),
    updatedAt: toIso(raw.updated_at),
    platform: 'lumin-sign',
    metadata: strMap({
      signingType: raw.signing_type,
      detailsUrl: raw.details_url,
      reason: raw.reason,
    }),
    raw,
  }
}
