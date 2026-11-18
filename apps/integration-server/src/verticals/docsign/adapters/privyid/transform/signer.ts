import type { Signer, SignerRole, SignerStatus } from '../../../schema/signer'
import { pickNum, pickStr, strMap, toIso } from './shared'

/**
 * A Privy document recipient. Each recipient is identified by their Privy
 * identity (`privyId`); `type` is `Signer` or `Reviewer`. The per-recipient
 * status reflects where they are in the signing/review flow, and `signed`
 * (a boolean) is set once they have completed it.
 */
export interface RawPrivyRecipient {
  privyId?: string
  enterpriseToken?: string
  recipientToken?: string
  email?: string
  name?: string
  /** `Signer` | `Reviewer`. */
  type?: string
  /** Per-recipient state, e.g. `In Progress`, `Completed`, `Rejected`. */
  status?: string
  signed?: boolean
  /** Sequencing index for serial signing flows (1-indexed). */
  sequence?: number | string
  signingDate?: string
  signedDate?: string
  date?: string
  rejectReason?: string
  reason?: string
  [key: string]: unknown
}

function mapRole(type: string | undefined): SignerRole {
  const t = (type ?? '').toLowerCase()
  if (t === 'reviewer') return 'approver'
  if (t === 'cc') return 'cc'
  return 'signer'
}

function mapStatus(raw: RawPrivyRecipient): SignerStatus {
  if (raw.signed === true) return 'signed'
  const s = (raw.status ?? '').toLowerCase()
  if (s.includes('complete') || s.includes('signed') || s.includes('done')) return 'signed'
  if (s.includes('reject') || s.includes('declin') || s.includes('cancel')) return 'declined'
  if (s.includes('view') || s.includes('open') || s.includes('read')) return 'delivered'
  if (s.includes('progress') || s.includes('pending') || s.includes('waiting') || s.includes('sent'))
    return 'sent'
  return 'created'
}

export function transformSigner(raw: RawPrivyRecipient, envelopeId: string): Signer {
  const externalId = raw.privyId ?? raw.enterpriseToken ?? raw.recipientToken ?? raw.email ?? ''
  return {
    id: `${envelopeId}:${externalId}`,
    externalId,
    envelopeId,
    email: pickStr(raw.email) ?? '',
    name: pickStr(raw.name) ?? '',
    role: mapRole(raw.type),
    status: mapStatus(raw),
    routingOrder: pickNum(raw.sequence),
    signedAt: toIso(raw.signedDate ?? raw.signingDate ?? (raw.signed ? raw.date : undefined)),
    declineReason: pickStr(raw.rejectReason ?? raw.reason),
    platform: 'privyid',
    metadata: strMap({
      privyId: raw.privyId,
      type: raw.type,
      status: raw.status,
      enterpriseToken: raw.enterpriseToken,
    }),
    raw,
  }
}
