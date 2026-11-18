import type { Signer, SignerStatus } from '../../../schema/signer'
import { joinName, pickNum, pickStr, strMap, toIso } from './shared'

/** routingOrder must be a positive int per the schema; drop 0 / negatives. */
function routingOrder(level: unknown): number | undefined {
  const n = pickNum(level)
  return n !== undefined && n >= 1 ? Math.trunc(n) : undefined
}

/**
 * A Click & Sign signatory → canonical Signer. Two shapes occur in the wild:
 * the compact form nested under a signature (`name`/`surname`/`signatory_status`)
 * and the verbose `get_signatory_details` form (`signatory_name`/
 * `signatory_surname`/`signatory_status_date`). Both are accepted.
 */
export interface RawLleidaNetSignatory {
  signatory_id: number | string
  level?: number | string
  signatory_level?: number | string
  name?: string
  surname?: string
  signatory_name?: string
  signatory_surname?: string
  email?: string
  signatory_email?: string
  phone?: string
  signatory_phone?: string
  id_number?: string
  signatory_id_number?: string
  signatory_status?: string
  signatory_status_date?: number | string
  signatory_landing_date?: number | string
  signatory_evidence_generated?: string
  ip?: string
  signature_method?: string[]
  signature_methods?: string[]
  [key: string]: unknown
}

/**
 * Click & Sign signatory statuses (`new`, `ready`, `sent`, `opened`,
 * `signed`, `rejected`/`declined`, `expired`) onto the canonical set. Click
 * & Sign has no distinct CC/witness roles — every signatory is a signer.
 */
function mapStatus(s: string | undefined): SignerStatus {
  const lower = (s ?? '').toLowerCase()
  if (lower === 'signed' || lower === 'completed') return 'signed'
  if (lower === 'rejected' || lower === 'declined') return 'declined'
  if (lower === 'opened' || lower === 'viewed' || lower === 'delivered') return 'delivered'
  if (lower === 'sent') return 'sent'
  if (lower === 'expired' || lower === 'autoresponded') return 'auto_responded'
  return 'created'
}

export function transformSigner(raw: RawLleidaNetSignatory, envelopeId: string): Signer {
  const externalId = String(raw.signatory_id)
  const status = mapStatus(raw.signatory_status)
  const statusAt = toIso(raw.signatory_status_date)
  return {
    id: `${envelopeId}:${externalId}`,
    externalId,
    envelopeId,
    email: pickStr(raw.email ?? raw.signatory_email) ?? '',
    name: joinName(raw.name ?? raw.signatory_name, raw.surname ?? raw.signatory_surname),
    role: 'signer',
    status,
    routingOrder: routingOrder(raw.level ?? raw.signatory_level),
    deliveredAt: toIso(raw.signatory_landing_date),
    signedAt: status === 'signed' ? statusAt : undefined,
    declinedAt: status === 'declined' ? statusAt : undefined,
    platform: 'lleida-net',
    metadata: strMap({
      phone: raw.phone ?? raw.signatory_phone,
      id_number: raw.id_number ?? raw.signatory_id_number,
      signatory_status: raw.signatory_status,
      signatory_evidence_generated: raw.signatory_evidence_generated,
      ip: raw.ip,
      signature_method: (raw.signature_method ?? raw.signature_methods ?? []).join(','),
    }),
    raw,
  }
}
