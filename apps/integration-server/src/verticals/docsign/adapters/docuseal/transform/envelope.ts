import type { Envelope, EnvelopeStatus } from '../../../schema/envelope'
import type { SigningOrder } from '../../../schema/shared'
import { pickStr, strMap, toIso } from './shared'
import type { RawDocusealSubmitter } from './signer'

/**
 * DocuSeal submission — a single send of one template to one or more
 * submitters. Surfaced as the canonical `Envelope`.
 */
export interface RawDocusealSubmission {
  id: number
  name?: string | null
  slug?: string
  source?: string
  status?: string
  submitters_order?: string
  audit_log_url?: string | null
  combined_document_url?: string | null
  created_at?: string
  updated_at?: string
  archived_at?: string | null
  completed_at?: string | null
  expire_at?: string | null
  submitters?: RawDocusealSubmitter[]
  template?: {
    id?: number
    name?: string
    external_id?: string | null
    folder_name?: string
    created_at?: string
    updated_at?: string
  }
  created_by_user?: {
    id?: number
    first_name?: string
    last_name?: string
    email?: string
  } | null
  submission_events?: Array<{
    id?: number
    submitter_id?: number
    event_type?: string
    event_timestamp?: string
    data?: Record<string, unknown>
  }>
  documents?: Array<{ name?: string; url?: string }>
  metadata?: Record<string, unknown>
  [key: string]: unknown
}

function mapStatus(raw: string | undefined): EnvelopeStatus {
  switch ((raw ?? '').toLowerCase()) {
    case 'completed':
      return 'completed'
    case 'declined':
      return 'declined'
    case 'expired':
      return 'expired'
    case 'pending':
      return 'sent'
    default:
      return 'draft'
  }
}

function signingOrder(raw: RawDocusealSubmission): SigningOrder {
  return (raw.submitters_order ?? '').toLowerCase() === 'preserved' ? 'sequential' : 'parallel'
}

function senderName(
  user: RawDocusealSubmission['created_by_user'],
): string | undefined {
  if (!user) return undefined
  const parts = [user.first_name, user.last_name].filter(
    (p): p is string => typeof p === 'string' && p.length > 0,
  )
  return parts.length > 0 ? parts.join(' ') : undefined
}

export function transformEnvelope(raw: RawDocusealSubmission): Envelope {
  const submitters = raw.submitters ?? []
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    status: mapStatus(raw.status),
    subject: raw.name ?? raw.template?.name ?? '',
    senderId: raw.created_by_user?.id != null ? String(raw.created_by_user.id) : undefined,
    senderEmail: pickStr(raw.created_by_user?.email),
    senderName: senderName(raw.created_by_user),
    signingOrder: signingOrder(raw),
    signerIds: submitters.map((s) => String(s.id)),
    documentIds: (raw.documents ?? []).map((_d, i) => `${raw.id}:${i}`),
    templateId: raw.template?.id != null ? String(raw.template.id) : undefined,
    createdAt: toIso(raw.created_at),
    completedAt: toIso(raw.completed_at),
    expiresAt: toIso(raw.expire_at),
    updatedAt: toIso(raw.updated_at),
    platform: 'docuseal',
    metadata: strMap({
      slug: raw.slug,
      source: raw.source,
      submittersOrder: raw.submitters_order,
      auditLogUrl: raw.audit_log_url,
      combinedDocumentUrl: raw.combined_document_url,
      archivedAt: raw.archived_at,
      templateName: raw.template?.name,
      templateFolder: raw.template?.folder_name,
      ...(raw.metadata ?? {}),
    }),
    raw,
  }
}
