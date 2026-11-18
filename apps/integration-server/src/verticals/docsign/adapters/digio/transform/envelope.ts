import type { Envelope, EnvelopeStatus } from '../../../schema/envelope'
import { pickStr, strMap, toIso } from './shared'
import { digioSignerId } from './signer'

export interface RawDigioSigningParty {
  identifier?: string
  signer_id?: string
  name?: string
  type?: string
  reason?: string
  status?: string
  signed_at?: string
  expire_at?: string
  declined_at?: string
  decline_reason?: string
  signing_order?: number
  [key: string]: unknown
}

export interface RawDigioDocument {
  id: string
  file_name?: string
  agreement_type?: string
  agreement_status?: string
  status?: string
  created_at?: string
  updated_at?: string
  expire_in_days?: number
  completed_at?: string
  signing_parties?: RawDigioSigningParty[]
  parties?: RawDigioSigningParty[]
  template_key?: string
  customer_identifier?: string
  customer_name?: string
  metadata?: Record<string, unknown>
  [key: string]: unknown
}

function mapStatus(raw: RawDigioDocument): EnvelopeStatus {
  const s = (raw.agreement_status ?? raw.status ?? '').toLowerCase()
  if (s === 'signed' || s === 'completed') return 'completed'
  if (s === 'requested' || s === 'sent' || s === 'in_progress') return 'sent'
  if (s === 'expired') return 'expired'
  if (s === 'cancelled' || s === 'canceled' || s === 'voided') return 'voided'
  if (s === 'declined' || s === 'rejected') return 'declined'
  return 'draft'
}

function extractSigners(raw: RawDigioDocument): RawDigioSigningParty[] {
  if (Array.isArray(raw.signing_parties)) return raw.signing_parties
  if (Array.isArray(raw.parties)) return raw.parties
  return []
}

export function transformEnvelope(raw: RawDigioDocument): Envelope {
  const signers = extractSigners(raw)
  const orders = signers.map((s) => s.signing_order ?? 0)
  const signing: 'parallel' | 'sequential' = new Set(orders).size > 1 ? 'sequential' : 'parallel'
  return {
    id: raw.id,
    externalId: raw.id,
    status: mapStatus(raw),
    subject: pickStr(raw.file_name) ?? '',
    senderId: pickStr(raw.customer_identifier),
    senderName: pickStr(raw.customer_name),
    signingOrder: signing,
    // Same id space as transformSigner: a party is keyed by its documented identifier.
    signerIds: signers
      .map((s) => s.identifier)
      .filter((k): k is string => typeof k === 'string' && k.length > 0)
      .map((identifier) => digioSignerId(raw.id, identifier)),
    documentIds: [raw.id],
    templateId: pickStr(raw.template_key),
    createdAt: toIso(raw.created_at),
    updatedAt: toIso(raw.updated_at),
    completedAt: toIso(raw.completed_at),
    platform: 'digio',
    metadata: strMap({ ...raw.metadata, agreementType: raw.agreement_type }),
    raw,
  }
}
