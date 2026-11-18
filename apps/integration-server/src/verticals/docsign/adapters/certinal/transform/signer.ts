import type { Signer, SignerRole, SignerStatus } from '../../../schema/signer'
import { pickNum, pickStr, strMap, toIso } from './shared'
import type { RawCertinalCandidate, RawCertinalParticipant } from './envelope'

/**
 * Certinal nests the actual people (candidates) inside a participant, which
 * carries the role + sequence. The adapter emits one canonical Signer per
 * candidate, keyed `<participantId>:<candidateId>` since candidate ids are
 * only unique within a participant.
 */

function mapRole(role: string | undefined): SignerRole {
  const r = (role ?? '').toUpperCase()
  if (r === 'SIGNER' || r === 'SIGN') return 'signer'
  if (r === 'CC' || r === 'CARBON_COPY' || r === 'RECEIVES_A_COPY') return 'cc'
  if (r === 'IN_PERSON' || r === 'IN_PERSON_SIGNER' || r === 'INPERSON') return 'in_person_signer'
  if (r === 'WITNESS') return 'witness'
  if (r === 'EDITOR' || r === 'PREPARER' || r === 'SENDER') return 'editor'
  if (r === 'APPROVER' || r === 'APPROVE' || r === 'REVIEWER') return 'approver'
  return 'signer'
}

function mapStatus(status: string | undefined, action: string | undefined): SignerStatus {
  const s = (status ?? action ?? '').toUpperCase()
  if (s === 'COMPLETED' || s === 'SIGNED' || s === 'EXECUTED' || s === 'APPROVED') return 'signed'
  if (s === 'DECLINED' || s === 'REJECTED') return 'declined'
  if (s === 'VIEWED' || s === 'DELIVERED' || s === 'OPENED') return 'delivered'
  if (s === 'SENT' || s === 'IN_PROGRESS' || s === 'INPROGRESS' || s === 'PENDING') return 'sent'
  if (s === 'AUTO_RESPONDED' || s === 'AUTORESPONDED') return 'auto_responded'
  return 'created'
}

function signedAt(candidate: RawCertinalCandidate): string | undefined {
  const action = (candidate.action ?? '').toUpperCase()
  if (action === 'SIGNED' || action === 'COMPLETED' || action === 'APPROVED' || action === 'EXECUTED') {
    return toIso(candidate.actionDate)
  }
  return undefined
}

function declinedAt(candidate: RawCertinalCandidate): string | undefined {
  const action = (candidate.action ?? '').toUpperCase()
  if (action === 'DECLINED' || action === 'REJECTED') return toIso(candidate.actionDate)
  return undefined
}

export function transformSigner(
  candidate: RawCertinalCandidate,
  participant: RawCertinalParticipant,
  envelopeId: string,
): Signer {
  const candidateId = pickStr(candidate.id) ?? participant.id
  return {
    id: `${participant.id}:${candidateId}`,
    externalId: candidateId,
    envelopeId,
    email: pickStr(candidate.emailAddress) ?? '',
    name: pickStr(candidate.name) ?? '',
    role: mapRole(participant.role),
    status: mapStatus(participant.status, candidate.action),
    routingOrder: participant.sequence != null ? pickNum(participant.sequence) : undefined,
    signedAt: signedAt(candidate),
    declinedAt: declinedAt(candidate),
    platform: 'certinal',
    metadata: strMap({
      participantId: participant.id,
      participantStatus: participant.status,
      candidateType: candidate.type,
      candidateAction: candidate.action,
      language: candidate.language,
    }),
    raw: candidate,
  }
}
