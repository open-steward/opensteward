import type { Envelope, EnvelopeStatus } from '../../../schema/envelope'
import { pickStr, strMap, toIso } from './shared'

export interface RawSkribbleSignatureRequest {
  id: string
  title?: string
  message?: string
  status?: string
  legislation?: string
  quality?: string
  signatures?: Array<{
    sid?: string
    account_email?: string
    signer_identity_data?: {
      email_address?: string
      first_name?: string
      last_name?: string
    }
    status_code?: string
    signed_at?: string
    order?: number
  }>
  /** Documented: "ID of the `Document` object" (SignatureRequest (Response)). */
  document_id?: string
  documents?: Array<{ document_id?: string; title?: string }>
  document_ids?: string[]
  ordered_signing?: boolean
  owner?: string
  read_access?: string[]
  created_at?: string
  updated_at?: string
  expires_at?: string
  callback_success_url?: string
  callback_error_url?: string
  callback_update_url?: string
  metadata?: Record<string, string>
  external_id?: string
  [key: string]: unknown
}

function mapStatus(s: string | undefined): EnvelopeStatus {
  switch (s) {
    case 'OPEN':
      return 'sent'
    case 'SIGNED':
      return 'completed'
    case 'DECLINED':
      return 'declined'
    case 'WITHDRAWN':
      return 'voided'
    case 'EXPIRED':
      return 'expired'
    case 'DRAFT':
      return 'draft'
    default:
      return 'draft'
  }
}

export function transformEnvelope(raw: RawSkribbleSignatureRequest): Envelope {
  const docIds =
    raw.documents?.map((d) => d.document_id).filter((id): id is string => !!id) ??
    raw.document_ids ??
    []
  const signerIds =
    raw.signatures?.map((s) => s.sid).filter((id): id is string => !!id) ?? []
  return {
    id: raw.id,
    externalId: pickStr(raw.external_id) ?? raw.id,
    status: mapStatus(raw.status),
    subject: pickStr(raw.title) ?? '',
    message: pickStr(raw.message),
    senderEmail: pickStr(raw.owner),
    signingOrder: raw.ordered_signing ? 'sequential' : 'parallel',
    signerIds,
    documentIds: docIds,
    createdAt: toIso(raw.created_at),
    updatedAt: toIso(raw.updated_at),
    expiresAt: toIso(raw.expires_at),
    platform: 'skribble',
    metadata: strMap({
      ...raw.metadata,
      legislation: raw.legislation,
      quality: raw.quality,
    }),
    raw,
  }
}
