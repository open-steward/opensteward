import { toIsoDatetime } from '@opensteward/shared'
import type { Envelope, EnvelopeStatus } from '../../../schema/envelope'
import { pickStr, strMap } from './shared'
import type { RawSignPlusRecipient } from './signer'
import type { RawSignPlusDocument } from './document'

/** Recipients are grouped into ordered signing steps. */
export interface RawSignPlusSigningStep {
  recipients?: RawSignPlusRecipient[]
}

export interface RawSignPlusEnvelope {
  id: string
  name?: string
  comment?: string
  pages?: number
  flow_type?: string
  legality_level?: string
  status?: string
  created_at?: number
  updated_at?: number
  expires_at?: number
  num_recipients?: number
  is_duplicable?: boolean
  signing_steps?: RawSignPlusSigningStep[]
  documents?: RawSignPlusDocument[]
  notification?: { subject?: string; message?: string; reminder_interval?: number }
  [key: string]: unknown
}

function mapStatus(raw: string | undefined): EnvelopeStatus {
  switch ((raw ?? '').toUpperCase()) {
    case 'DRAFT':
      return 'draft'
    // PENDING/IN_PROGRESS — out for signature, awaiting recipients.
    case 'PENDING':
    case 'IN_PROGRESS':
      return 'sent'
    case 'COMPLETED':
      return 'completed'
    case 'DECLINED':
      return 'declined'
    case 'VOIDED':
      return 'voided'
    case 'EXPIRED':
      return 'expired'
    default:
      return 'draft'
  }
}

/** Flatten the ordered signing steps into a single ordered recipient-id list. */
function envelopeSignerIds(raw: RawSignPlusEnvelope): string[] {
  const ids: string[] = []
  for (const step of raw.signing_steps ?? []) {
    for (const r of step.recipients ?? []) {
      if (r.id) ids.push(r.id)
    }
  }
  return ids
}

/** More than one signing step ⇒ recipients sign in sequence. */
function signingOrder(raw: RawSignPlusEnvelope): 'parallel' | 'sequential' {
  return (raw.signing_steps ?? []).length > 1 ? 'sequential' : 'parallel'
}

export function transformEnvelope(raw: RawSignPlusEnvelope): Envelope {
  return {
    id: raw.id,
    externalId: raw.id,
    status: mapStatus(raw.status),
    subject: pickStr(raw.notification?.subject) ?? raw.name ?? '',
    message: pickStr(raw.notification?.message),
    signingOrder: signingOrder(raw),
    signerIds: envelopeSignerIds(raw),
    documentIds: (raw.documents ?? []).map((d) => d.id).filter((id): id is string => !!id),
    createdAt: toIsoDatetime(raw.created_at),
    updatedAt: toIsoDatetime(raw.updated_at),
    expiresAt: toIsoDatetime(raw.expires_at),
    platform: 'sign-plus',
    metadata: strMap({
      name: raw.name,
      comment: raw.comment,
      flowType: raw.flow_type,
      legalityLevel: raw.legality_level,
      pages: raw.pages,
      numRecipients: raw.num_recipients,
      reminderInterval: raw.notification?.reminder_interval,
    }),
    raw,
  }
}
