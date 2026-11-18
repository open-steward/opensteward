import type { Signer, SignerRole, SignerStatus } from '../../../schema/signer'
import { pickNum, pickStr, strMap, toIso } from './shared'

export interface RawEversignSigner {
  id?: number | string
  signer_id?: number | string
  email?: string
  name?: string
  role?: string
  signing_role?: string
  status?: string
  signed?: number | boolean
  declined?: number | boolean
  viewed?: number | boolean
  sent?: number | boolean
  routing_order?: number | string
  order?: number | string
  signed_at?: number | string
  viewed_at?: number | string
  delivered_at?: number | string
  sent_at?: number | string
  declined_at?: number | string
  decline_reason?: string
  message?: string
  [key: string]: unknown
}

function mapRole(role: string | undefined): SignerRole {
  const r = (role ?? '').toLowerCase()
  if (r === 'cc' || r === 'carbon_copy') return 'cc'
  if (r === 'in_person' || r === 'in_person_signer') return 'in_person_signer'
  if (r === 'witness') return 'witness'
  if (r === 'editor' || r === 'agent') return 'editor'
  if (r === 'approver') return 'approver'
  return 'signer'
}

function mapStatus(raw: RawEversignSigner): SignerStatus {
  if (raw.declined) return 'declined'
  if (raw.signed) return 'signed'
  if (raw.viewed) return 'delivered'
  if (raw.sent) return 'sent'
  const lower = (raw.status ?? '').toLowerCase()
  if (lower === 'signed' || lower === 'completed') return 'signed'
  if (lower === 'declined') return 'declined'
  if (lower === 'viewed' || lower === 'delivered') return 'delivered'
  if (lower === 'sent') return 'sent'
  return 'created'
}

export function transformSigner(raw: RawEversignSigner, envelopeId: string): Signer {
  const externalId = pickStr(raw.id) ?? pickStr(raw.signer_id) ?? ''
  return {
    id: `${envelopeId}:${externalId}`,
    externalId,
    envelopeId,
    email: pickStr(raw.email) ?? '',
    name: pickStr(raw.name) ?? '',
    role: mapRole(raw.role ?? raw.signing_role),
    status: mapStatus(raw),
    routingOrder: pickNum(raw.routing_order ?? raw.order),
    sentAt: toIso(raw.sent_at),
    deliveredAt: toIso(raw.delivered_at ?? raw.viewed_at),
    signedAt: toIso(raw.signed_at),
    declinedAt: toIso(raw.declined_at),
    declineReason: pickStr(raw.decline_reason),
    platform: 'eversign',
    metadata: strMap({ role: raw.role, signing_role: raw.signing_role }),
    raw,
  }
}
