import type { Signer, SignerRole, SignerStatus } from '../../../schema/signer'
import { pickNum, pickStr, strMap, toIso } from './shared'

/**
 * A signer on a Tilaka signing request. Each signer is identified by their
 * Tilaka identity (`tilaka_name`, the `user_identifier` used across the
 * Sign+ API); `signing_id` is the per-request signer handle. `sequence`
 * orders serial signing flows, and `status` reflects where the signer is in
 * the flow.
 */
export interface RawTilakaSignature {
  /** The signer's registered Tilaka identity — used as `user_identifier`. */
  tilaka_name?: string
  user_identifier?: string
  /** Per-request signer handle. */
  signing_id?: string
  email?: string
  name?: string
  /** Per-signer state, e.g. `signed`, `pending`, `sent`, `denied`, `DONE`. */
  status?: string
  sequence?: number | string
  /** Tilaka echoes the signer's seal placement page(s) on some payloads. */
  pages?: number | string
  sign_date?: string
  signed_date?: string
  deny_reason?: string
  reason?: string
  [key: string]: unknown
}

function mapStatus(raw: string | undefined): SignerStatus {
  const s = (raw ?? '').toLowerCase()
  if (s === 'done' || s.includes('signed') || s.includes('complete') || s.includes('success'))
    return 'signed'
  if (s.includes('denied') || s.includes('reject') || s.includes('declin') || s.includes('cancel'))
    return 'declined'
  if (s.includes('view') || s.includes('open') || s.includes('read') || s.includes('deliver'))
    return 'delivered'
  if (s.includes('sent') || s.includes('pending') || s.includes('progress') || s.includes('waiting'))
    return 'sent'
  return 'created'
}

export function transformSigner(raw: RawTilakaSignature, envelopeId: string): Signer {
  const externalId = raw.tilaka_name ?? raw.user_identifier ?? raw.signing_id ?? raw.email ?? ''
  const status = mapStatus(raw.status)
  return {
    id: `${envelopeId}:${externalId}`,
    externalId,
    envelopeId,
    email: pickStr(raw.email) ?? '',
    name: pickStr(raw.name) ?? '',
    role: 'signer' as SignerRole,
    status,
    routingOrder: pickNum(raw.sequence),
    signedAt: status === 'signed' ? toIso(raw.signed_date ?? raw.sign_date) : undefined,
    declineReason: status === 'declined' ? pickStr(raw.deny_reason ?? raw.reason) : undefined,
    platform: 'tilaka',
    metadata: strMap({
      tilaka_name: raw.tilaka_name,
      signing_id: raw.signing_id,
      status: raw.status,
      pages: raw.pages,
    }),
    raw,
  }
}
