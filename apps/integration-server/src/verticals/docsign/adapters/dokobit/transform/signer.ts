/**
 * Dokobit Portal API signer (an element of `signers` in GET
 * /api/signing/{token}/status.json, https://beta.dokobit.com/api/doc) →
 * canonical Signer.
 */
import type { Signer, SignerRole, SignerStatus } from '../../../schema/signer'
import { pickStr, strMap, toIso } from './shared'

export interface RawDokobitSigner {
  token?: string
  first_name?: string | null
  last_name?: string | null
  code?: string | null
  country?: string | null
  email?: string | null
  type?: string
  status?: string
  decline_reason?: string | null
  signature?: { signing_time?: string | null; [key: string]: unknown } | unknown[]
  meta_information?: Record<string, unknown>
}

/**
 * Signer statuses in the documentation: `signed`, `pending`, `declined` in the
 * status.json example, and `pending` | `queued` in the signing_created postback.
 */
function mapStatus(s: string | undefined): SignerStatus {
  switch (s) {
    case 'signed':
      return 'signed'
    case 'declined':
      return 'declined'
    case 'pending':
      return 'sent'
    case 'queued':
      return 'created'
    default:
      return 'unknown'
  }
}

/**
 * The response field is `type` (status.json example `"type":"signer"`; the
 * signing_created postback documents `"signer" | "approver" | "receiver"`).
 * The create param signers[][role]: "User's role. Can be viewer, signer,
 * approver or receiver."
 */
function mapRole(t: string | undefined): SignerRole {
  switch (t) {
    case 'signer':
      return 'signer'
    case 'approver':
      return 'approver'
    default:
      return 'unknown'
  }
}

function signingTime(sig: RawDokobitSigner['signature']): string | undefined {
  if (!sig || Array.isArray(sig)) return undefined
  return toIso(sig.signing_time)
}

export function transformSigner(raw: RawDokobitSigner, envelopeId: string): Signer {
  const token = pickStr(raw.token)
  if (token === undefined) {
    throw new Error(`Dokobit signing ${envelopeId}: a signer has no token`)
  }
  const name = [pickStr(raw.first_name), pickStr(raw.last_name)]
    .filter((s): s is string => s !== undefined)
    .join(' ')
  // signers[][name] and signers[][surname] are optional create params ("false"
  // in the Required column; a signer may be identified by personal code
  // alone). The canonical name is required and nothing else documented names
  // the signer, so refuse rather than emit an empty placeholder.
  if (name === '') {
    throw new Error(`Dokobit signing ${envelopeId}: signer ${token} has no first_name or last_name`)
  }
  return {
    id: token,
    externalId: token,
    envelopeId,
    email: pickStr(raw.email),
    name,
    role: mapRole(pickStr(raw.type)),
    status: mapStatus(pickStr(raw.status)),
    signedAt: signingTime(raw.signature),
    declineReason: pickStr(raw.decline_reason),
    platform: 'dokobit',
    metadata: strMap({ type: raw.type, country: raw.country }),
    // The personal code (national ID) and the signature certificate stay out.
    raw: {
      token: raw.token,
      first_name: raw.first_name,
      last_name: raw.last_name,
      country: raw.country,
      email: raw.email,
      type: raw.type,
      status: raw.status,
      decline_reason: raw.decline_reason,
    },
  }
}
