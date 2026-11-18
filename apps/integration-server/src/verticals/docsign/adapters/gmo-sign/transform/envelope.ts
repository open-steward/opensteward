import type { Envelope, EnvelopeStatus } from '../../../schema/envelope'
import { pickStr, strMap, toIso } from './shared'
import type { RawGmoSignSigner } from './signer'
import type { RawGmoSignDocument } from './document'

/**
 * Raw GMO Sign envelope, as returned in the `result` of `/envelope/status`
 * (and echoed by the template-send / sign-request responses). GMO Sign keys
 * the envelope by `envelope_xid`; documents and signers are embedded.
 *
 * Docs: https://support.questetra.com/addons/gmo-sign-envelope-retrieve-status/
 */
export interface RawGmoSignEnvelope {
  envelope_xid: string
  envelope_name?: string
  /** Numeric/textual status code, e.g. completed / in-progress. */
  envelope_status?: string
  sender_name?: string
  sender_post_name?: string
  bounced_note_mail?: string
  created_date?: string
  completed_date?: string
  expire_date?: string
  document_list?: RawGmoSignDocument[]
  signer_list?: RawGmoSignSigner[]
  [key: string]: unknown
}

/**
 * GMO Sign reports envelope status as a code (string). Known values cover the
 * signing lifecycle; anything unmapped falls back to `sent` (request issued).
 */
function mapStatus(raw: string | undefined): EnvelopeStatus {
  const s = (raw ?? '').toLowerCase()
  if (s === '' || s === 'draft' || s === 'unsent' || s === '0') return 'draft'
  if (s === 'sent' || s === 'requested' || s === 'in_progress' || s === 'signing' || s === '1') return 'sent'
  if (s === 'delivered' || s === 'viewed') return 'delivered'
  if (s === 'completed' || s === 'signed' || s === 'agreed' || s === 'done' || s === '2') return 'completed'
  if (s === 'declined' || s === 'rejected' || s === 'refused') return 'declined'
  if (s === 'voided' || s === 'cancelled' || s === 'canceled' || s === 'withdrawn') return 'voided'
  if (s === 'expired') return 'expired'
  return 'sent'
}

/** Document control numbers form the envelope's documentIds. */
function envelopeDocumentIds(raw: RawGmoSignEnvelope): string[] {
  return (raw.document_list ?? [])
    .map((d) => pickStr(d.control_number) ?? pickStr(d.documentId))
    .filter((v): v is string => typeof v === 'string')
}

/** Signers ordered by `order_no`; the signer id is `envelope_signer_id`. */
function envelopeSignerIds(raw: RawGmoSignEnvelope): string[] {
  return (raw.signer_list ?? [])
    .map((s) => ({
      id: pickStr(s.envelope_signer_id) ?? pickStr(s.email) ?? '',
      order: Number(s.order_no ?? '0'),
    }))
    .filter((s) => s.id.length > 0)
    .sort((a, b) => a.order - b.order)
    .map((s) => s.id)
}

/** Distinct, present order numbers > 1 imply a sequential signing flow. */
function signingOrder(raw: RawGmoSignEnvelope): 'parallel' | 'sequential' {
  const orders = (raw.signer_list ?? []).map((s) => Number(s.order_no ?? '0'))
  if (orders.length === 0) return 'parallel'
  return new Set(orders).size > 1 ? 'sequential' : 'parallel'
}

export function transformEnvelope(raw: RawGmoSignEnvelope): Envelope {
  const completedAt = toIso(raw.completed_date)
  return {
    id: raw.envelope_xid,
    externalId: raw.envelope_xid,
    status: mapStatus(raw.envelope_status),
    subject: pickStr(raw.envelope_name) ?? '',
    senderName: pickStr(raw.sender_name),
    signingOrder: signingOrder(raw),
    signerIds: envelopeSignerIds(raw),
    documentIds: envelopeDocumentIds(raw),
    createdAt: toIso(raw.created_date),
    completedAt,
    expiresAt: toIso(raw.expire_date),
    updatedAt: completedAt,
    platform: 'gmo-sign',
    metadata: strMap({
      envelope_status: raw.envelope_status,
      sender_post_name: raw.sender_post_name,
      bounced_note_mail: raw.bounced_note_mail,
    }),
    raw,
  }
}
