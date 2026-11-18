import type { Signer, SignerRole, SignerStatus } from '../../../schema/signer'
import { pickStr, strMap } from './shared'

export interface RawAdobeSignMember {
  id?: string
  email?: string
  name?: string
  status?: string
  privateMessage?: string
  securityOption?: { authenticationMethod?: string }
}

export interface RawAdobeSignParticipantSet {
  id: string
  role?: string
  order?: number
  status?: string
  memberInfos?: RawAdobeSignMember[]
}

function mapRole(role: string | undefined): SignerRole {
  switch (role) {
    case 'SIGNER':
      return 'signer'
    case 'APPROVER':
      return 'approver'
    case 'ACCEPTOR':
      return 'approver'
    case 'CC':
      return 'cc'
    case 'DELEGATE_TO_SIGNER':
      return 'editor'
    case 'FORM_FILLER':
      return 'editor'
    case 'WITNESS':
      return 'witness'
    case 'IN_PERSON_SIGNER':
      return 'in_person_signer'
    default:
      return 'signer'
  }
}

function mapStatus(raw: string | undefined): SignerStatus {
  switch (raw) {
    case 'COMPLETED':
    case 'SIGNED':
      return 'signed'
    case 'CANCELLED':
    case 'REJECTED':
      return 'declined'
    case 'WAITING_FOR_MY_SIGNATURE':
    case 'WAITING_FOR_AUTHORING':
    case 'WAITING_FOR_APPROVAL':
    case 'WAITING_FOR_ACCEPTANCE':
    case 'WAITING_FOR_DELIVERY':
      return 'sent'
    case 'WAITING_FOR_OTHERS':
    case 'NOT_YET_VISIBLE':
      return 'created'
    case 'WAITING_FOR_PREFILL':
      return 'created'
    default:
      return 'created'
  }
}

export function transformSigner(
  member: RawAdobeSignMember,
  set: RawAdobeSignParticipantSet,
  envelopeId: string,
): Signer {
  return {
    id: `${set.id}:${member.id ?? member.email ?? ''}`,
    externalId: member.id ?? member.email ?? '',
    envelopeId,
    email: pickStr(member.email) ?? '',
    name: pickStr(member.name) ?? '',
    role: mapRole(set.role),
    status: mapStatus(member.status ?? set.status),
    routingOrder: set.order != null ? set.order : undefined,
    platform: 'adobe-acrobat-sign',
    metadata: strMap({
      participantSetId: set.id,
      authMethod: member.securityOption?.authenticationMethod,
    }),
    raw: member,
  }
}
