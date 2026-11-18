import type { Envelope, EnvelopeStatus } from '../../../schema/envelope'
import { pickStr, strMap, toIso } from './shared'

export interface RawClicksignSigner {
  key?: string
  email?: string
  name?: string
  sign_as?: string
  status?: string
  sign_order?: number
  signed_at?: string
  refused_at?: string
  refusal_reason?: string
  sent_at?: string
  delivered_at?: string
  [key: string]: unknown
}

export interface RawClicksignDocument {
  key: string
  filename?: string
  filename_with_extension?: string
  uploaded_at?: string
  updated_at?: string
  finished_at?: string
  deadline_at?: string
  cancelled_at?: string
  status?: string
  template?: { key?: string; name?: string }
  template_key?: string
  signable_group?: string
  signers?: RawClicksignSigner[]
  list?: { signers?: RawClicksignSigner[] }
  events?: unknown
  account?: { name?: string; email?: string }
  metadata?: Record<string, unknown>
  [key: string]: unknown
}

function mapStatus(raw: RawClicksignDocument): EnvelopeStatus {
  const s = (raw.status ?? '').toLowerCase()
  if (s === 'closed' || s === 'finished' || s === 'completed') return 'completed'
  if (s === 'running' || s === 'open' || s === 'sent') return 'sent'
  if (s === 'cancelled' || s === 'canceled' || s === 'voided') return 'voided'
  if (s === 'refused' || s === 'declined') return 'declined'
  if (s === 'expired') return 'expired'
  return 'draft'
}

function extractSigners(raw: RawClicksignDocument): RawClicksignSigner[] {
  if (Array.isArray(raw.signers)) return raw.signers
  if (raw.list && Array.isArray(raw.list.signers)) return raw.list.signers
  return []
}

export function transformEnvelope(raw: RawClicksignDocument): Envelope {
  const signers = extractSigners(raw)
  const orders = signers.map((s) => s.sign_order ?? 0)
  const signing: 'parallel' | 'sequential' = new Set(orders).size > 1 ? 'sequential' : 'parallel'
  return {
    id: raw.key,
    externalId: raw.key,
    status: mapStatus(raw),
    subject: pickStr(raw.filename_with_extension) ?? pickStr(raw.filename) ?? '',
    senderEmail: pickStr(raw.account?.email),
    senderName: pickStr(raw.account?.name),
    signingOrder: signing,
    signerIds: signers
      .map((s) => s.key)
      .filter((k): k is string => typeof k === 'string'),
    documentIds: [raw.key],
    templateId: pickStr(raw.template?.key) ?? pickStr(raw.template_key),
    createdAt: toIso(raw.uploaded_at),
    updatedAt: toIso(raw.updated_at),
    completedAt: toIso(raw.finished_at),
    voidedAt: toIso(raw.cancelled_at),
    expiresAt: toIso(raw.deadline_at),
    platform: 'clicksign',
    metadata: strMap(raw.metadata),
    raw,
  }
}
