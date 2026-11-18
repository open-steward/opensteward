import type { Envelope, EnvelopeStatus } from '../../../schema/envelope'
import { pickStr, strMap, toIso } from './shared'

export interface RawAdobeSignAgreement {
  id: string
  name?: string
  status?: string
  message?: string
  senderEmail?: string
  participantSetsInfo?: Array<{
    id: string
    role?: string
    order?: number
    status?: string
    memberInfos?: Array<{ id?: string; email?: string; name?: string }>
  }>
  fileInfos?: Array<{ documentId?: string; label?: string }>
  documentVisibilityEnabled?: boolean
  signatureFlow?: string
  createdDate?: string
  signatureType?: string
  expirationTime?: string
  groupId?: string
  externalId?: { id?: string }
  workflowId?: string
  [key: string]: unknown
}

function mapStatus(raw: string | undefined): EnvelopeStatus {
  switch (raw) {
    case 'OUT_FOR_SIGNATURE':
    case 'OUT_FOR_DELIVERY':
    case 'OUT_FOR_ACCEPTANCE':
    case 'OUT_FOR_FORM_FILLING':
    case 'OUT_FOR_APPROVAL':
    case 'OUT_FOR_WITNESSING':
      return 'sent'
    case 'SIGNED':
    case 'APPROVED':
    case 'COMPLETED':
    case 'WIDGET_COMPLETED':
    case 'ACCEPTED':
    case 'FORM_FILLED':
    case 'DELIVERED':
      return 'completed'
    case 'CANCELLED':
    case 'REJECTED':
      return 'declined'
    case 'EXPIRED':
      return 'expired'
    case 'ARCHIVED':
    case 'PREFILL':
    case 'AUTHORING':
    case 'DRAFT':
      return 'draft'
    default:
      return 'draft'
  }
}

function signerIds(raw: RawAdobeSignAgreement): string[] {
  return (raw.participantSetsInfo ?? [])
    .slice()
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .flatMap((set) => (set.memberInfos ?? []).map((m) => `${set.id}:${m.id ?? m.email ?? ''}`))
}

export function transformEnvelope(raw: RawAdobeSignAgreement): Envelope {
  const orders = (raw.participantSetsInfo ?? []).map((p) => p.order ?? 0)
  const signing: 'parallel' | 'sequential' = new Set(orders).size > 1 ? 'sequential' : 'parallel'
  return {
    id: raw.id,
    externalId: raw.id,
    status: mapStatus(raw.status),
    subject: raw.name ?? '',
    message: pickStr(raw.message),
    senderEmail: pickStr(raw.senderEmail),
    signingOrder: signing,
    signerIds: signerIds(raw),
    documentIds: (raw.fileInfos ?? [])
      .map((f) => f.documentId)
      .filter((id): id is string => typeof id === 'string'),
    createdAt: toIso(raw.createdDate),
    expiresAt: toIso(raw.expirationTime),
    platform: 'adobe-acrobat-sign',
    metadata: strMap({
      signatureFlow: raw.signatureFlow,
      signatureType: raw.signatureType,
      workflowId: raw.workflowId,
      externalId: raw.externalId?.id,
    }),
    raw,
  }
}
