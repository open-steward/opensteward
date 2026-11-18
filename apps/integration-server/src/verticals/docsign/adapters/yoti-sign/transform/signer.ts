import type { Signer, SignerRole, SignerStatus } from '../../../schema/signer'
import { pickStr, strMap, toIsoDatetime } from './shared'

/**
 * Yoti Sign recipient as returned under `details.recipients` of
 * `GET /v2/envelopes/<envelopeId>`.
 *
 * `role`/`type` enum: SIGNER | CC. `auth_type` enum: no-auth | sign-auth |
 * idv. `sign_status` enum: SIGNED | UNSIGNED.
 */
export interface RawYotiSignRecipient {
  id?: string
  name?: string
  email?: string
  role?: string
  /** Some payloads label the recipient kind `type` instead of `role`. */
  type?: string
  auth_type?: string
  sign_status?: string
  signed_at?: string
  [key: string]: unknown
}

function mapRole(raw: RawYotiSignRecipient): SignerRole {
  switch ((raw.role ?? raw.type ?? '').toUpperCase()) {
    case 'CC':
      return 'cc'
    case 'WITNESS':
      return 'witness'
    case 'SIGNER':
      return 'signer'
    default:
      return 'signer'
  }
}

function mapStatus(signStatus: string | undefined): SignerStatus {
  switch ((signStatus ?? '').toUpperCase()) {
    case 'SIGNED':
      return 'signed'
    case 'UNSIGNED':
      return 'sent'
    default:
      return 'created'
  }
}

export function transformSigner(raw: RawYotiSignRecipient, envelopeId: string): Signer {
  const recipientId = pickStr(raw.id) ?? ''
  return {
    id: recipientId ? `${envelopeId}:${recipientId}` : envelopeId,
    externalId: recipientId,
    envelopeId,
    email: pickStr(raw.email) ?? '',
    name: pickStr(raw.name) ?? '',
    role: mapRole(raw),
    status: mapStatus(raw.sign_status),
    signedAt: toIsoDatetime(raw.signed_at),
    platform: 'yoti-sign',
    metadata: strMap({ authType: raw.auth_type, signStatus: raw.sign_status }),
    raw,
  }
}
