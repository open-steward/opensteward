import type { Signer, SignerRole, SignerStatus } from '../../../schema/signer'
import { pickStr, strMap, toIsoDatetime } from './shared'

/**
 * Sertifi participant → canonical Signer.
 *
 * Sertifi participants carry no name fields and no decline info; the role
 * and signing order both come from `participantType` (CC, FirstSigner …
 * TenthSigner). Signer status is inferred from the `signed` /
 * `lastVisitedAt` / `lastInvitedAt` markers Sertifi exposes.
 */
export interface RawSertifiParticipant {
  userId?: string
  email?: string
  /** CC | FirstSigner | SecondSigner | … | TenthSigner. */
  participantType?: string
  lastInvitedAt?: string
  lastVisitedAt?: string
  /** Stringified count of signed documents for this participant. */
  signed?: string
  /** Stringified count of unsigned/open documents for this participant. */
  open?: string
  mustSignWithName?: string
  enableIdCheck?: boolean
  [key: string]: unknown
}

const SIGNER_LEVELS: Record<string, number> = {
  firstsigner: 1,
  secondsigner: 2,
  thirdsigner: 3,
  fourthsigner: 4,
  fifthsigner: 5,
  sixthsigner: 6,
  seventhsigner: 7,
  eighthsigner: 8,
  ninthsigner: 9,
  tenthsigner: 10,
}

/** 1-indexed signer level from a participantType, or undefined for CC/unknown. */
export function participantSignerLevel(participantType: string | undefined): number | undefined {
  return SIGNER_LEVELS[(participantType ?? '').toLowerCase()]
}

function mapRole(participantType: string | undefined): SignerRole {
  const t = (participantType ?? '').toLowerCase()
  if (t === 'cc') return 'cc'
  if (t in SIGNER_LEVELS) return 'signer'
  return 'unknown'
}

function mapStatus(raw: RawSertifiParticipant): SignerStatus {
  const signedCount = Number(raw.signed ?? '0')
  if (!Number.isNaN(signedCount) && signedCount > 0) return 'signed'
  if (raw.lastVisitedAt) return 'delivered'
  if (raw.lastInvitedAt) return 'sent'
  return 'created'
}

export function transformSigner(raw: RawSertifiParticipant, envelopeId: string): Signer {
  const externalId = pickStr(raw.userId) ?? pickStr(raw.email) ?? ''
  const level = participantSignerLevel(raw.participantType)
  return {
    id: `${envelopeId}:${externalId}`,
    externalId,
    envelopeId,
    email: pickStr(raw.email) ?? '',
    name: '',
    role: mapRole(raw.participantType),
    status: mapStatus(raw),
    routingOrder: level,
    sentAt: toIsoDatetime(raw.lastInvitedAt),
    deliveredAt: toIsoDatetime(raw.lastVisitedAt),
    platform: 'sertifi',
    metadata: strMap({
      participantType: raw.participantType,
      signed: raw.signed,
      open: raw.open,
      enableIdCheck: raw.enableIdCheck,
      mustSignWithName: raw.mustSignWithName,
    }),
    raw,
  }
}
