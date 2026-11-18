import type { Signer, SignerStatus } from '../../../schema/signer'
import { pickNum, pickStr, strMap } from './shared'

/**
 * Raw GMO Sign signer (`resSigner`), embedded in an envelope's `signer_list`.
 * GMO Sign keys signers by `envelope_signer_id` and tracks per-signer
 * progress via `sign_status`. All entries are signers — GMO Sign's signing
 * roles (approver/recipient) live on the request payload, not the status
 * response — so every row maps to the canonical `signer` role.
 *
 * Docs: https://learn.microsoft.com/en-us/connectors/gmosign/
 */
export interface RawGmoSignSigner {
  envelope_signer_id?: string
  envelope_sign_token?: string
  order_no?: string
  name?: string
  organize_name?: string
  email?: string
  phone_number?: string
  sign_status?: string
  signed_date?: string
  [key: string]: unknown
}

function mapStatus(s: string | undefined): SignerStatus {
  const lower = (s ?? '').toLowerCase()
  if (lower === 'signed' || lower === 'completed' || lower === 'agreed' || lower === 'done' || lower === '2') return 'signed'
  if (lower === 'declined' || lower === 'rejected' || lower === 'refused') return 'declined'
  if (lower === 'viewed' || lower === 'delivered' || lower === 'opened') return 'delivered'
  if (lower === 'sent' || lower === 'requested' || lower === 'pending' || lower === '1') return 'sent'
  return 'created'
}

export function transformSigner(raw: RawGmoSignSigner, envelopeId: string): Signer {
  const signerId = pickStr(raw.envelope_signer_id) ?? pickStr(raw.email)
  return {
    id: signerId ? `${envelopeId}:${signerId}` : envelopeId,
    externalId: signerId ?? '',
    envelopeId,
    email: pickStr(raw.email) ?? '',
    name: pickStr(raw.name) ?? '',
    role: 'signer',
    status: mapStatus(raw.sign_status),
    routingOrder: pickNum(raw.order_no),
    platform: 'gmo-sign',
    metadata: strMap({
      sign_status: raw.sign_status,
      organize_name: raw.organize_name,
      phone_number: raw.phone_number,
    }),
    raw,
  }
}
