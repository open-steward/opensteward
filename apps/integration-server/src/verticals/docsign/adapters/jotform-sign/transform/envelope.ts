import type { Envelope, EnvelopeStatus } from '../../../schema/envelope'
import { pickStr, strMap, toIso } from './shared'

/**
 * A Jotform Sign document is a form whose `type` is `SIGN`. The form object is
 * returned by `GET /user/forms` and `GET /form/{id}`; the signers (and the
 * "signed" events) come from the form's submissions, which the adapter fetches
 * separately and threads in as `signerIds`.
 */
export interface RawJotformForm {
  id: string
  username?: string
  title?: string
  height?: string
  url?: string
  /** `ENABLED` | `DISABLED` | `DELETED` | `TRASHED`. */
  status?: string
  /** Form kind — `SIGN` for Jotform Sign documents, `LEGACY`/`CARD` otherwise. */
  type?: string
  created_at?: string
  updated_at?: string
  last_submission?: string | null
  /** New (unread) submission count, as a numeric string. */
  new?: string
  /** Total submission count, as a numeric string. */
  count?: string
  favorite?: string
  archived?: string
  [key: string]: unknown
}

/**
 * Jotform forms have no envelope-style send/sign lifecycle. We map the form's
 * enable state plus whether it has gathered any signatures: an enabled SIGN
 * form with at least one submission is treated as `sent`, a fully-collected
 * form (`new === 0` with submissions) as `completed`, an archived/disabled
 * form as `voided`, and an untouched draft as `draft`.
 */
function mapStatus(raw: RawJotformForm): EnvelopeStatus {
  const status = (raw.status ?? '').toUpperCase()
  const count = Number(raw.count ?? '0')
  if (status === 'DELETED' || status === 'TRASHED') return 'voided'
  if (raw.archived === '1') return 'voided'
  if (status === 'DISABLED') return count > 0 ? 'completed' : 'voided'
  // ENABLED
  if (count <= 0) return 'draft'
  return 'sent'
}

export function transformEnvelope(raw: RawJotformForm, signerIds: string[] = []): Envelope {
  const completedAt =
    Number(raw.count ?? '0') > 0 ? toIso(raw.last_submission ?? undefined) : undefined
  return {
    id: raw.id,
    externalId: raw.id,
    status: mapStatus(raw),
    subject: pickStr(raw.title) ?? '',
    senderName: pickStr(raw.username),
    // Jotform forms gather signers in parallel — each signer submits the same
    // Sign document independently; there is no enforced routing order.
    signingOrder: 'parallel',
    signerIds,
    documentIds: [],
    createdAt: toIso(raw.created_at),
    completedAt,
    updatedAt: toIso(raw.updated_at),
    platform: 'jotform-sign',
    metadata: strMap({
      type: raw.type,
      status: raw.status,
      url: raw.url,
      submissionCount: raw.count,
      newSubmissions: raw.new,
      lastSubmission: raw.last_submission ?? undefined,
      favorite: raw.favorite,
      archived: raw.archived,
      username: raw.username,
    }),
    raw,
  }
}
