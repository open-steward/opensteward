/**
 * Signaturit `signature` → canonical Envelope.
 *
 * Only the fields of the documented "Signature" object are read
 * (https://docs.signaturit.com/api/latest): `created_at`, `data`,
 * `documents`, `id`, and `decliner_email` ("Only if a signer declines the
 * signature, the field decliner_email will appear in the given response").
 */
import type { Envelope, EnvelopeStatus } from '../../../schema/envelope'
import { pickStr, requireStr, toIso } from './shared'

/** An item of `documents[].events`: "created_at" and "type". */
export interface RawSignaturitEvent {
  created_at?: string
  type?: string
}

/**
 * An item of `documents`: "A document item is created for every signer and
 * uploaded file." It carries the signer (`email`, `name`), the `file`, the
 * `status` and the `events`.
 */
export interface RawSignaturitDocumentItem {
  id: string
  email?: string
  name?: string
  status?: string
  created_at?: string
  events?: RawSignaturitEvent[]
  file?: { name?: string; pages?: number; size?: number }
}

export interface RawSignaturitSignature {
  id: string
  created_at?: string
  /** Documented as a list of `{ key, value }` pairs (the `crm_id` example). */
  data?: Array<{ key?: string; value?: unknown }>
  documents?: RawSignaturitDocumentItem[]
  decliner_email?: string
}

/** Canonical id of a document item: its signature id and its own id. */
export function itemKey(envelopeId: string, itemId: string): string {
  return `${envelopeId}:${itemId}`
}

/**
 * A signature has no status of its own in the docs; its document items do
 * ("Filter signatures with documents with certain status"). The envelope
 * takes the most decisive one: any declined / canceled / expired item ends
 * the request that way, every item completed completes it, and a request with
 * an item ready / signing / completed and the rest still pending is out for
 * signature. Items all in_queue ("The document is being processed.") have
 * not been sent yet, and the canonical envelope has no status for that, so
 * it is `unknown` (the signer rows report the same items as `created`).
 */
function envelopeStatus(items: RawSignaturitDocumentItem[]): EnvelopeStatus {
  const statuses = items.map((d) => d.status)
  if (statuses.length === 0) return 'unknown'
  if (statuses.includes('declined')) return 'declined'
  if (statuses.includes('canceled')) return 'voided'
  if (statuses.includes('expired')) return 'expired'
  const pending = ['in_queue', 'ready', 'signing', 'completed']
  if (!statuses.every((s) => s !== undefined && pending.includes(s))) return 'unknown'
  if (statuses.every((s) => s === 'completed')) return 'completed'
  return statuses.every((s) => s === 'in_queue') ? 'unknown' : 'sent'
}

function dataPairs(data: RawSignaturitSignature['data']): Record<string, string> {
  const out: Record<string, string> = {}
  for (const pair of Array.isArray(data) ? data : []) {
    const key = pickStr(pair?.key)
    if (key === undefined || pair.value === null || pair.value === undefined) continue
    if (typeof pair.value === 'object') continue
    out[key] = String(pair.value)
  }
  return out
}

export function transformEnvelope(raw: RawSignaturitSignature): Envelope {
  const id = requireStr(raw.id, 'signature id')
  const items = raw.documents ?? []
  const itemIds = items.map((d) => itemKey(id, requireStr(d.id, 'document id')))
  const metadata = dataPairs(raw.data)
  const declinerEmail = pickStr(raw.decliner_email)
  if (declinerEmail) metadata['declinerEmail'] = declinerEmail
  return {
    id,
    externalId: id,
    status: envelopeStatus(items),
    // The documented Signature object carries no subject (`subject` is only
    // an OPTIONAL create parameter), so none is reported.
    subject: '',
    // `signing_mode` is a create parameter, absent from the documented
    // object: "Note: the default value is sequential."
    signingOrder: 'sequential',
    // One document item per signer and file: both lists are the items.
    signerIds: itemIds,
    documentIds: itemIds,
    createdAt: toIso(raw.created_at),
    platform: 'signaturit',
    metadata,
    raw,
  }
}
