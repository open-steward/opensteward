/**
 * Annature envelope → canonical Envelope.
 *
 * Fields per "The Envelope object"
 * (https://docs.annature.com.au/api-reference/envelopes/envelope-object.md):
 * `id`, `name`, `message`, `status` ("Possible values: `draft`, `created`,
 * `sent`, `completed`, `voided`."), `shared`, `created`, `sent`, `voided`,
 * `declined`, `completed`, `original`, `master`, `certificate`, `combined`,
 * `account_id`, `group_id`, `recipients`, `metadata`.
 *
 * The envelope object carries no documents; they are read from
 * `GET /v1/documents?envelope_id=` (listDocuments), so `documentIds` is empty
 * here rather than guessed.
 *
 * `original`, `master`, `certificate` and `combined` are temporary download
 * links to the signed content, which the docsign schema refuses, so they are
 * dropped from `raw` too.
 */
import type { Envelope, EnvelopeStatus } from '../../../schema/envelope'
import type { RawAnnatureRecipient } from './signer'
import { strMap, toIso } from './shared'

export interface RawAnnatureEnvelope {
  id: string
  name: string
  message?: string | null
  status?: string
  shared?: boolean
  created?: string | null
  sent?: string | null
  voided?: string | null
  declined?: string | null
  completed?: string | null
  original?: string | null
  master?: string | null
  certificate?: string | null
  combined?: string | null
  account_id?: string | null
  group_id?: string | null
  recipients: RawAnnatureRecipient[]
  metadata?: Record<string, unknown> | null
}

function mapStatus(s: string | undefined): EnvelopeStatus {
  // "`created` – The envelope is in the process of being prepared for
  // delivery. This is a short-lived transitional state immediately before
  // sending." Not yet sent, so it reads as a draft.
  switch (s) {
    case 'draft':
    case 'created':
      return 'draft'
    case 'sent':
      return 'sent'
    case 'completed':
      return 'completed'
    case 'voided':
      return 'voided'
    default:
      return 'unknown'
  }
}

/** The envelope without its temporary download links. */
function withoutDownloadLinks(raw: RawAnnatureEnvelope): Record<string, unknown> {
  const { original: _o, master: _m, certificate: _c, combined: _cb, ...rest } = raw
  return rest
}

export function transformEnvelope(raw: RawAnnatureEnvelope): Envelope {
  // "There must be at least one recipient with a type of `signer`": an
  // envelope without its recipients array is refused, not read as having none.
  if (!Array.isArray(raw.recipients)) {
    throw new Error(`annature envelope ${raw.id} came back without its recipients array`)
  }
  const recipients = raw.recipients
  // "Recipients with a lower `order` value must complete their actions before
  // recipients with a higher value are notified."
  const orders = new Set(recipients.map((r) => r.order))
  return {
    id: raw.id,
    externalId: raw.id,
    status: mapStatus(raw.status),
    subject: raw.name,
    message: raw.message ?? undefined,
    senderId: raw.account_id ?? undefined,
    signingOrder: orders.size > 1 ? 'sequential' : 'parallel',
    signerIds: recipients.map((r) => r.id),
    documentIds: [],
    createdAt: toIso(raw.created),
    sentAt: toIso(raw.sent),
    completedAt: toIso(raw.completed),
    declinedAt: toIso(raw.declined),
    voidedAt: toIso(raw.voided),
    platform: 'annature',
    metadata: strMap(raw.metadata),
    raw: withoutDownloadLinks(raw),
  }
}
