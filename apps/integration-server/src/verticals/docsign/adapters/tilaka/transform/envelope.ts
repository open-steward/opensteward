import type { Envelope, EnvelopeStatus } from '../../../schema/envelope'
import { pickStr, strMap, toIso } from './shared'
import type { RawTilakaSignature } from './signer'
import type { RawTilakaPdf } from './document'

/**
 * A Tilaka Sign+ *signing request*, as returned by `/plus-checksignstatus`.
 * In the docsign canon, a signing request IS the envelope: it carries its
 * title (`document_name`), the initiator, the workflow status, the signers
 * (`signatures` / `signature`) and the documents (`list_pdf`) inline. It is
 * identified by `request_id`.
 *
 * `/plus-checksignstatus` wraps the detail in `{ success, message, data }`
 * where `message` is the coarse status (e.g. `DONE`); the per-request detail
 * lives under `data`. Field aliases below cover the shapes seen on both the
 * status endpoint and the document-detail view.
 */
export interface RawTilakaSigningRequest {
  request_id: string
  document_name?: string
  /** Per-request workflow status, e.g. `on_progress`, `draft`, `done`, `denied`. */
  status?: string
  date?: string
  request_date?: string
  /** Initiator may be a flat tilaka_name/email string or a nested object. */
  initiator?: string | { tilaka_name?: string; email?: string }
  signatures?: RawTilakaSignature[]
  /** Some payloads nest the signer list under `signature`. */
  signature?: RawTilakaSignature[]
  list_pdf?: RawTilakaPdf[]
  execute_expiry?: string
  /** Coarse status echoed at the top level of the checksignstatus response. */
  message?: string
  [key: string]: unknown
}

function mapStatus(raw: string | undefined): EnvelopeStatus {
  const s = (raw ?? '').toLowerCase()
  if (s.includes('draft')) return 'draft'
  if (s === 'done' || s.includes('complete') || s.includes('signed') || s.includes('success'))
    return 'completed'
  if (s.includes('denied') || s.includes('reject') || s.includes('declin')) return 'declined'
  if (s.includes('cancel') || s.includes('void') || s.includes('revoke')) return 'voided'
  if (s.includes('expire')) return 'expired'
  if (s.includes('progress') || s.includes('pending') || s.includes('waiting') || s.includes('sent'))
    return 'sent'
  return 'sent'
}

function signers(raw: RawTilakaSigningRequest): RawTilakaSignature[] {
  return raw.signatures ?? raw.signature ?? []
}

function signerExternalId(s: RawTilakaSignature): string {
  return s.tilaka_name ?? s.user_identifier ?? s.signing_id ?? s.email ?? ''
}

function signingOrder(raw: RawTilakaSigningRequest): 'parallel' | 'sequential' {
  const seqs = signers(raw)
    .map((s) => Number(s.sequence ?? 0))
    .filter((n) => !Number.isNaN(n))
  if (seqs.length === 0) return 'parallel'
  return new Set(seqs).size > 1 ? 'sequential' : 'parallel'
}

function initiatorTilakaName(raw: RawTilakaSigningRequest): string | undefined {
  if (typeof raw.initiator === 'string') return pickStr(raw.initiator)
  return pickStr(raw.initiator?.tilaka_name)
}

function initiatorEmail(raw: RawTilakaSigningRequest): string | undefined {
  if (raw.initiator && typeof raw.initiator === 'object') return pickStr(raw.initiator.email)
  return undefined
}

export function transformEnvelope(raw: RawTilakaSigningRequest): Envelope {
  const sigs = signers(raw)
  const senderId = initiatorTilakaName(raw)
  return {
    id: raw.request_id,
    externalId: raw.request_id,
    status: mapStatus(raw.status ?? raw.message),
    subject: raw.document_name ?? '',
    senderId,
    senderEmail: initiatorEmail(raw),
    senderName: senderId,
    signingOrder: signingOrder(raw),
    signerIds: sigs
      .map((s) => `${raw.request_id}:${signerExternalId(s)}`)
      .filter((id) => !id.endsWith(':')),
    documentIds: (raw.list_pdf ?? []).map((p, i) => `${raw.request_id}:${p.filename ?? i}`),
    createdAt: toIso(raw.date ?? raw.request_date),
    expiresAt: toIso(raw.execute_expiry),
    platform: 'tilaka',
    metadata: strMap({
      status: raw.status,
      message: raw.message,
    }),
    raw,
  }
}
