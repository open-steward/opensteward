import type { Envelope, EnvelopeStatus } from '../../../schema/envelope'
import { pickStr, strMap, toIso } from './shared'

export interface RawYousignSignatureRequest {
  id: string
  status?: string
  name?: string
  delivery_mode?: string
  email_custom_note?: string
  expiration_date?: string
  created_at?: string
  updated_at?: string
  signers?: Array<{
    id: string
    info?: { email?: string; first_name?: string; last_name?: string }
    status?: string
    signature_order?: number
    signed_at?: string
  }>
  documents?: Array<{ id: string; filename?: string; nature?: string }>
  ordered_signers?: boolean
  signers_allowed_to_decline?: boolean
  source?: string
  external_id?: string
  metadata?: Record<string, string>
  workspace_id?: string
  [key: string]: unknown
}

function mapStatus(s: string | undefined): EnvelopeStatus {
  switch (s) {
    case 'draft':
      return 'draft'
    case 'ongoing':
      return 'sent'
    case 'done':
      return 'completed'
    case 'expired':
      return 'expired'
    case 'canceled':
    case 'cancelled':
      return 'voided'
    case 'declined':
    case 'rejected':
      return 'declined'
    case 'approval':
      return 'sent'
    default:
      return 'draft'
  }
}

export function transformEnvelope(raw: RawYousignSignatureRequest): Envelope {
  return {
    id: raw.id,
    externalId: pickStr(raw.external_id) ?? raw.id,
    status: mapStatus(raw.status),
    subject: pickStr(raw.name) ?? '',
    message: pickStr(raw.email_custom_note),
    signingOrder: raw.ordered_signers ? 'sequential' : 'parallel',
    signerIds: (raw.signers ?? []).map((s) => s.id),
    documentIds: (raw.documents ?? []).map((d) => d.id),
    createdAt: toIso(raw.created_at),
    updatedAt: toIso(raw.updated_at),
    expiresAt: toIso(raw.expiration_date),
    platform: 'yousign',
    metadata: strMap({
      ...raw.metadata,
      source: raw.source,
      workspaceId: raw.workspace_id,
      deliveryMode: raw.delivery_mode,
    }),
    raw,
  }
}
