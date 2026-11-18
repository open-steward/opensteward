import type { Envelope, EnvelopeStatus } from '../../../schema/envelope'
import { pickStr, strMap, toIsoDatetime } from './shared'
import type { RawYotiSignRecipient } from './signer'

/**
 * Yoti Sign envelope as returned by `GET /v2/envelopes/<envelopeId>`. The
 * recipients live under `details.recipients`; `find` results additionally
 * surface a top-level `created_at`.
 *
 * Status enum (per docs): QUEUED | ACTIVE | ARCHIVED | COMPLETE | ERRORED
 * (the status endpoint also emits COMPLETED / ERROR variants).
 */
export interface RawYotiSignEnvelope {
  envelope_id: string
  status?: string
  /** `find` results echo the envelope name/title here. */
  envelope?: string
  created_at?: string
  archived_at?: string
  errors?: unknown
  details?: {
    recipients?: RawYotiSignRecipient[]
    [key: string]: unknown
  }
  [key: string]: unknown
}

function mapStatus(raw: string | undefined): EnvelopeStatus {
  switch ((raw ?? '').toUpperCase()) {
    case 'QUEUED':
      return 'sent'
    case 'ACTIVE':
      return 'sent'
    case 'COMPLETE':
    case 'COMPLETED':
      return 'completed'
    case 'ARCHIVED':
      // Yoti "archive" cancels an envelope that has not yet completed.
      return 'voided'
    case 'ERRORED':
    case 'ERROR':
      return 'draft'
    default:
      return 'draft'
  }
}

export function transformEnvelope(raw: RawYotiSignEnvelope): Envelope {
  const recipients = raw.details?.recipients ?? []
  const status = mapStatus(raw.status)
  return {
    id: raw.envelope_id,
    externalId: raw.envelope_id,
    status,
    subject: pickStr(raw.envelope) ?? '',
    signingOrder: 'parallel',
    signerIds: recipients
      .map((r) => pickStr(r.id))
      .filter((id): id is string => !!id),
    documentIds: [],
    createdAt: toIsoDatetime(raw.created_at),
    voidedAt: status === 'voided' ? toIsoDatetime(raw.archived_at) : undefined,
    platform: 'yoti-sign',
    metadata: strMap({
      rawStatus: raw.status,
      recipientCount: recipients.length,
      archivedAt: raw.archived_at,
      hasErrors: raw.errors != null,
    }),
    raw,
  }
}
