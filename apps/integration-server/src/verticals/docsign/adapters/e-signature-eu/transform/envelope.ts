import type { Envelope, EnvelopeStatus } from '../../../schema/envelope'
import { pickBool, pickStr, strMap, toIso } from './shared'
import type { RawESignatureEuSigner } from './signer'

/**
 * A signature request on e-Signature.eu. `signers` is an object map keyed by
 * the 1-indexed signing position ("1", "2", ...), not an array. `id_sign` is
 * a numeric request id. `pdf_file_base64` (the signed document body) is
 * intentionally NOT modelled here — content never crosses the firewall.
 */
export interface RawESignatureEuRequest {
  id_sign?: number | string
  lang?: string
  doc_name?: string
  send_email?: boolean
  from_api?: boolean
  signature_redirect?: string
  status_id?: string
  date_status?: string
  signers?: Record<string, RawESignatureEuSigner>
  [key: string]: unknown
}

/** A bare list row from `/signature/list` — id + status only. */
export interface RawESignatureEuListRow {
  id_sign?: number | string
  status_id?: string
  [key: string]: unknown
}

/**
 * e-Signature.eu request lifecycle → canonical envelope status.
 *   pending   → sent       (awaiting one or more signatures)
 *   finished  → completed  (all signatories signed)
 *   skipped   → voided     (terminated while only partially signed)
 *   cancelled → voided     (cancelled before anyone signed)
 *   deleted   → voided     (removed from the platform)
 */
function mapStatus(s: string | undefined): EnvelopeStatus {
  switch (s) {
    case 'pending':
      return 'sent'
    case 'finished':
      return 'completed'
    case 'skipped':
    case 'cancelled':
    case 'deleted':
      return 'voided'
    default:
      return 'draft'
  }
}

export function envelopeId(raw: RawESignatureEuRequest | RawESignatureEuListRow): string {
  return pickStr(raw.id_sign) ?? ''
}

/** Sorted signing positions present on the request, e.g. ["1", "2"]. */
function positionsOf(raw: RawESignatureEuRequest): string[] {
  const signers = raw.signers
  if (!signers || typeof signers !== 'object') return []
  return Object.keys(signers).sort((a, b) => Number(a) - Number(b))
}

export function transformEnvelope(raw: RawESignatureEuRequest): Envelope {
  const id = envelopeId(raw)
  const positions = positionsOf(raw)
  const signerIds = positions.map((pos) => `${id}:${pos}`)
  const status = mapStatus(raw.status_id)
  const dateStatus = toIso(raw.date_status)
  // `sign_first` sequences the signing groups, so any signer flagged true
  // makes the order sequential; otherwise everyone is invited in parallel.
  const sequential = positions.some(
    (pos) => pickBool(raw.signers?.[pos]?.sign_first) === true,
  )
  // The API exposes only one `date_status` (last lifecycle change); map it to
  // the matching terminal canonical timestamp and leave the rest absent.
  return {
    id,
    externalId: id,
    status,
    subject: pickStr(raw.doc_name) ?? '',
    signingOrder: sequential ? 'sequential' : 'parallel',
    signerIds,
    documentIds: id ? [`${id}:doc`] : [],
    updatedAt: dateStatus,
    completedAt: status === 'completed' ? dateStatus : undefined,
    voidedAt: status === 'voided' ? dateStatus : undefined,
    platform: 'e-signature-eu',
    metadata: strMap({
      lang: raw.lang,
      sendEmail: raw.send_email,
      fromApi: raw.from_api,
      signatureRedirect: raw.signature_redirect,
      statusId: raw.status_id,
    }),
    raw,
  }
}

export function transformListRow(raw: RawESignatureEuListRow): Envelope {
  const id = envelopeId(raw)
  const status = mapStatus(raw.status_id)
  return {
    id,
    externalId: id,
    status,
    subject: '',
    signingOrder: 'parallel',
    signerIds: [],
    documentIds: id ? [`${id}:doc`] : [],
    platform: 'e-signature-eu',
    metadata: strMap({ statusId: raw.status_id }),
    raw,
  }
}
