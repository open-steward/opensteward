import type { Envelope, EnvelopeStatus } from '../../../schema/envelope'
import { pickStr, strMap, toIso } from './shared'

export interface RawAutentiqueDocument {
  id: string
  name?: string
  refusable?: boolean
  sortable?: boolean
  created_at?: string
  updated_at?: string
  expiration_at?: string
  files?: { original?: string; signed?: string; certified?: string }
  signatures?: Array<{
    public_id?: string
    name?: string
    email?: string
    created_at?: string
    action?: { name?: string }
    link?: { short_link?: string }
    user?: { id?: string; name?: string; email?: string }
    user_data?: { name?: string; email?: string; cpf?: string }
    signed?: { ip?: string; created_at?: string; geolocation?: unknown }
    rejected?: { reason?: string; created_at?: string }
    viewed?: { created_at?: string }
  }>
  status?: string
  [key: string]: unknown
}

function mapStatus(raw: RawAutentiqueDocument): EnvelopeStatus {
  const s = (raw.status ?? '').toLowerCase()
  if (s === 'pendente' || s === 'pending') return 'sent'
  if (s === 'concluído' || s === 'concluido' || s === 'completed') return 'completed'
  if (s === 'cancelado' || s === 'cancelled' || s === 'canceled') return 'voided'
  if (s === 'expirado' || s === 'expired') return 'expired'
  if (s === 'rejeitado' || s === 'rejected' || s === 'declined') return 'declined'
  const allSigned = (raw.signatures ?? []).every((sig) => sig.signed)
  return allSigned && (raw.signatures ?? []).length > 0 ? 'completed' : 'sent'
}

export function transformEnvelope(raw: RawAutentiqueDocument): Envelope {
  const signers = raw.signatures ?? []
  return {
    id: raw.id,
    externalId: raw.id,
    status: mapStatus(raw),
    subject: pickStr(raw.name) ?? '',
    signingOrder: raw.sortable ? 'sequential' : 'parallel',
    signerIds: signers
      .map((s) => s.public_id ?? s.email ?? '')
      .filter((s): s is string => Boolean(s)),
    documentIds: [raw.id],
    createdAt: toIso(raw.created_at),
    updatedAt: toIso(raw.updated_at),
    expiresAt: toIso(raw.expiration_at),
    platform: 'autentique',
    metadata: strMap({
      refusable: raw.refusable,
      sortable: raw.sortable,
    }),
    raw,
  }
}
