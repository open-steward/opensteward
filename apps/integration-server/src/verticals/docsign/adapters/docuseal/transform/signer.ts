import type { Signer, SignerStatus } from '../../../schema/signer'
import { pickStr, strMap, toIso } from './shared'

/**
 * DocuSeal submitter — a single party invited to fill/sign a submission.
 * Surfaced as the canonical `Signer`. DocuSeal exposes a real
 * `GET /submitters/{id}` endpoint, so signers are individually addressable.
 */
export interface RawDocusealSubmitter {
  id: number
  submission_id?: number
  uuid?: string
  email?: string | null
  slug?: string
  status?: string
  sent_at?: string | null
  opened_at?: string | null
  completed_at?: string | null
  declined_at?: string | null
  created_at?: string
  updated_at?: string
  name?: string | null
  phone?: string | null
  external_id?: string | null
  role?: string
  metadata?: Record<string, unknown>
  preferences?: Record<string, unknown>
  values?: Array<{ field?: string; value?: unknown }>
  [key: string]: unknown
}

function mapStatus(code: string | undefined): SignerStatus {
  switch ((code ?? '').toLowerCase()) {
    case 'completed':
      return 'signed'
    case 'declined':
      return 'declined'
    case 'opened':
      return 'delivered'
    case 'sent':
      return 'sent'
    case 'awaiting':
      return 'created'
    default:
      return 'created'
  }
}

export function transformSigner(
  raw: RawDocusealSubmitter,
  submissionId: string | number,
): Signer {
  const envelopeId = String(raw.submission_id ?? submissionId)
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    envelopeId,
    email: pickStr(raw.email) ?? '',
    name: pickStr(raw.name) ?? '',
    role: 'signer',
    status: mapStatus(raw.status),
    sentAt: toIso(raw.sent_at),
    deliveredAt: toIso(raw.opened_at),
    signedAt: toIso(raw.completed_at),
    declinedAt: toIso(raw.declined_at),
    platform: 'docuseal',
    metadata: strMap({
      uuid: raw.uuid,
      slug: raw.slug,
      role: raw.role,
      phone: raw.phone,
      externalId: raw.external_id,
      statusCode: raw.status,
      ...(raw.metadata ?? {}),
    }),
    raw,
  }
}
