import type { Envelope, EnvelopeStatus } from '../../../schema/envelope'
import { pickStr, strMap, toIso } from './shared'

export interface RawD4SignSigner {
  email_signer?: string
  email?: string
  name_signer?: string
  name?: string
  uuid?: string
  uuid_signer?: string
  signature_type?: string
  act?: string
  user_signed?: string
  signed_at?: string
  refused_at?: string
  refused_reason?: string
  order?: number
  [key: string]: unknown
}

export interface RawD4SignDocument {
  uuid: string
  nameDoc?: string
  name?: string
  type?: string
  size?: string | number
  pages?: string | number
  uuidDoc?: string
  statusId?: string | number
  statusName?: string
  status_id?: string | number
  uuid_safe?: string
  uuid_signer?: string
  uuid_user?: string
  uuid_template?: string
  list?: RawD4SignSigner[]
  signers?: RawD4SignSigner[]
  list_signer?: RawD4SignSigner[]
  uploaded?: string
  uploaded_at?: string
  updated?: string
  finished?: string
  cancelled?: string
  metadata?: Record<string, unknown>
  [key: string]: unknown
}

/**
 * D4Sign uses integer statusIds. The mapping is best-effort across SDK
 * variants:
 *   1 → draft/processing
 *   2,3 → sent / waiting signatures
 *   4 → completed
 *   5 → voided / cancelled
 *   6 → declined / rejected
 *   7 → expired
 */
function mapStatus(raw: RawD4SignDocument): EnvelopeStatus {
  const code = String(raw.statusId ?? raw.status_id ?? '').trim()
  switch (code) {
    case '1':
      return 'draft'
    case '2':
    case '3':
      return 'sent'
    case '4':
      return 'completed'
    case '5':
      return 'voided'
    case '6':
      return 'declined'
    case '7':
      return 'expired'
    default:
      break
  }
  const name = (raw.statusName ?? '').toLowerCase()
  if (name.includes('finaliz') || name.includes('complete')) return 'completed'
  if (name.includes('cancel') || name.includes('void')) return 'voided'
  if (name.includes('rejeit') || name.includes('decline')) return 'declined'
  if (name.includes('expir')) return 'expired'
  if (name.includes('process') || name.includes('rascun') || name.includes('draft')) return 'draft'
  if (name.includes('assin') || name.includes('aguard') || name.includes('sent')) return 'sent'
  return 'draft'
}

function extractSigners(raw: RawD4SignDocument): RawD4SignSigner[] {
  if (Array.isArray(raw.signers)) return raw.signers
  if (Array.isArray(raw.list)) return raw.list
  if (Array.isArray(raw.list_signer)) return raw.list_signer
  return []
}

export function transformEnvelope(raw: RawD4SignDocument): Envelope {
  const signers = extractSigners(raw)
  const orders = signers.map((s) => s.order ?? 0)
  const signing: 'parallel' | 'sequential' = new Set(orders).size > 1 ? 'sequential' : 'parallel'
  return {
    id: raw.uuid,
    externalId: raw.uuid,
    status: mapStatus(raw),
    subject: pickStr(raw.nameDoc) ?? pickStr(raw.name) ?? '',
    senderId: pickStr(raw.uuid_user),
    signingOrder: signing,
    signerIds: signers
      .map((s) => s.uuid ?? s.uuid_signer)
      .filter((k): k is string => typeof k === 'string'),
    documentIds: [raw.uuid],
    templateId: pickStr(raw.uuid_template),
    createdAt: toIso(raw.uploaded ?? raw.uploaded_at),
    updatedAt: toIso(raw.updated),
    completedAt: toIso(raw.finished),
    voidedAt: toIso(raw.cancelled),
    platform: 'd4sign',
    metadata: strMap(raw.metadata),
    raw,
  }
}
