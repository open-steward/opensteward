import type { Envelope, EnvelopeStatus } from '../../../schema/envelope'
import { pickStr, strMap, toIso } from './shared'
import type { RawLleidaNetSignatory } from './signer'

/**
 * A Click & Sign signature process IS the canonical envelope. Shape from
 * `get_signature_list` / `get_signature_status`; signatories nest under the
 * `signatory` array (some responses use the plural `signatories`).
 */
export interface RawLleidaNetSignature {
  signature_id: number | string
  contract_id?: string
  config_id?: number | string
  config_name?: string
  signature_type?: string
  signature_status?: string
  signature_start_date?: number | string
  signature_status_date?: number | string
  signature_evidence_generated?: string
  signatory?: RawLleidaNetSignatory[]
  signatories?: RawLleidaNetSignatory[]
  [key: string]: unknown
}

/**
 * Click & Sign signature statuses. Observed values include `new`, `ready`,
 * `sent`, `signed`, `completed`, `cancelled`/`canceled`, `expired`,
 * `rejected`/`declined`. Map onto the canonical envelope status set.
 */
function mapStatus(raw: string | undefined): EnvelopeStatus {
  const s = (raw ?? '').toLowerCase()
  if (s === 'new' || s === 'ready' || s === 'created' || s === 'draft') return 'draft'
  if (s === 'sent') return 'sent'
  if (s === 'delivered' || s === 'opened' || s === 'viewed') return 'delivered'
  if (s === 'signed' || s === 'completed' || s === 'finished') return 'completed'
  if (s === 'rejected' || s === 'declined') return 'declined'
  if (s === 'cancelled' || s === 'canceled' || s === 'revoked') return 'voided'
  if (s === 'expired') return 'expired'
  return 'draft'
}

export function signatoriesOf(raw: RawLleidaNetSignature): RawLleidaNetSignatory[] {
  return raw.signatory ?? raw.signatories ?? []
}

/** Click & Sign drives signatory ordering through the per-signatory `level`. */
function signingOrder(raw: RawLleidaNetSignature): 'parallel' | 'sequential' {
  const levels = signatoriesOf(raw)
    .map((s) => Number(s.level ?? s.signatory_level ?? 0))
    .filter((n) => !Number.isNaN(n))
  if (levels.length === 0) return 'parallel'
  return new Set(levels).size > 1 ? 'sequential' : 'parallel'
}

function signerIds(raw: RawLleidaNetSignature): string[] {
  return signatoriesOf(raw)
    .slice()
    .sort(
      (a, b) =>
        Number(a.level ?? a.signatory_level ?? 0) - Number(b.level ?? b.signatory_level ?? 0),
    )
    .map((s) => String(s.signatory_id))
}

export function transformEnvelope(raw: RawLleidaNetSignature): Envelope {
  const id = String(raw.signature_id)
  const status = mapStatus(raw.signature_status)
  const statusAt = toIso(raw.signature_status_date)
  return {
    id,
    externalId: id,
    status,
    subject: pickStr(raw.config_name) ?? pickStr(raw.contract_id) ?? '',
    signingOrder: signingOrder(raw),
    signerIds: signerIds(raw),
    documentIds: [],
    createdAt: toIso(raw.signature_start_date),
    sentAt: status !== 'draft' ? toIso(raw.signature_start_date) : undefined,
    completedAt: status === 'completed' ? statusAt : undefined,
    declinedAt: status === 'declined' ? statusAt : undefined,
    voidedAt: status === 'voided' ? statusAt : undefined,
    expiresAt: status === 'expired' ? statusAt : undefined,
    updatedAt: statusAt,
    platform: 'lleida-net',
    metadata: strMap({
      contract_id: raw.contract_id,
      config_id: raw.config_id,
      config_name: raw.config_name,
      signature_type: raw.signature_type,
      signature_status: raw.signature_status,
      signature_evidence_generated: raw.signature_evidence_generated,
    }),
    raw,
  }
}
