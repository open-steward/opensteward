/**
 * Universign transaction → canonical Envelope.
 *
 * Fields per "The Transaction object" (https://apps.universign.com/docs/api/),
 * as returned by GET /v1/transactions/{transaction_id}.
 */
import type { Envelope, EnvelopeStatus } from '../../../schema/envelope'
import { emailOrUndefined, pickStr, scopedId, strMap, toIso } from './shared'
import type { RawUniversignTransaction } from './types'

/**
 * `state`: "Possible values are: - draft - started - paused - cancelled -
 * expired - closed (all participants have completed their action) - completed
 * (the final documents have been extended and are available for download)".
 * `paused` has no canonical counterpart.
 */
function mapStatus(s: string | undefined): EnvelopeStatus {
  switch (s) {
    case 'draft':
      return 'draft'
    case 'started':
      return 'sent'
    case 'cancelled':
      return 'voided'
    case 'expired':
      return 'expired'
    case 'closed':
    case 'completed':
      return 'completed'
    default:
      return 'unknown'
  }
}

export function transformEnvelope(raw: RawUniversignTransaction): Envelope {
  const state = pickStr(raw.state)
  const closedAt = toIso(raw.closed_at)
  return {
    id: raw.id,
    externalId: raw.id,
    status: mapStatus(state),
    // "The transaction name. Default value is the transaction ID."
    subject: pickStr(raw.name) ?? raw.id,
    senderEmail: emailOrUndefined(raw.creator?.email),
    senderName: pickStr(raw.creator?.name),
    // "instructions.sequencing: Sequencing instructions between participants."
    signingOrder: (raw.instructions?.sequencing?.length ?? 0) > 0 ? 'sequential' : 'parallel',
    signerIds: (raw.participants ?? []).map((p) => scopedId(raw.id, p.email)),
    documentIds: (raw.documents ?? []).map((d) => scopedId(raw.id, d.id)),
    createdAt: toIso(raw.created_at),
    sentAt: toIso(raw.started_at),
    expiresAt: toIso(raw.expires_at),
    completedAt: state === 'closed' || state === 'completed' ? closedAt : undefined,
    voidedAt: state === 'cancelled' ? closedAt : undefined,
    platform: 'universign',
    metadata: strMap({
      ...raw.metadata,
      state,
      folderId: raw.folder_id,
      language: raw.language,
      cancelCode: raw.cancel_code,
      cancelReason: raw.cancel_reason,
    }),
    raw,
  }
}
