import type { Envelope, EnvelopeStatus } from '../../../schema/envelope'
import { pickStr, strMap, toIso } from './shared'

export interface RawPandaDocDocument {
  id: string
  name?: string
  status?: string
  date_created?: string
  date_modified?: string
  date_completed?: string
  expiration_date?: string
  sent_by?: { id?: string; email?: string; first_name?: string; last_name?: string }
  created_by?: { id?: string; email?: string; first_name?: string; last_name?: string }
  template?: { id?: string }
  metadata?: Record<string, unknown>
  recipients?: Array<{
    id?: string
    email?: string
    first_name?: string
    last_name?: string
    recipient_type?: string
    has_completed?: boolean
    signing_order?: number
  }>
  tokens?: Array<{ name?: string; value?: string }>
  fields?: Array<unknown>
  pricing?: unknown
  [key: string]: unknown
}

function mapStatus(s: string | undefined): EnvelopeStatus {
  switch (s) {
    case 'document.draft':
      return 'draft'
    case 'document.sent':
      return 'sent'
    case 'document.viewed':
      return 'delivered'
    case 'document.waiting_approval':
    case 'document.approved':
    case 'document.rejected':
      return 'sent'
    case 'document.completed':
    case 'document.paid':
      return 'completed'
    case 'document.voided':
      return 'voided'
    case 'document.expired':
      return 'expired'
    case 'document.declined':
      return 'declined'
    default:
      return 'draft'
  }
}

export function transformEnvelope(raw: RawPandaDocDocument): Envelope {
  const sender = raw.sent_by ?? raw.created_by ?? {}
  const orders = (raw.recipients ?? []).map((r) => r.signing_order ?? 0)
  const signing: 'parallel' | 'sequential' = new Set(orders).size > 1 ? 'sequential' : 'parallel'
  return {
    id: raw.id,
    externalId: raw.id,
    status: mapStatus(raw.status),
    subject: raw.name ?? '',
    senderId: pickStr(sender.id),
    senderEmail: pickStr(sender.email),
    senderName: pickStr(
      [sender.first_name, sender.last_name].filter(Boolean).join(' ') || undefined,
    ),
    signingOrder: signing,
    signerIds: (raw.recipients ?? [])
      .map((r) => r.id ?? r.email ?? '')
      .filter((s): s is string => Boolean(s)),
    documentIds: [raw.id],
    templateId: pickStr(raw.template?.id),
    createdAt: toIso(raw.date_created),
    updatedAt: toIso(raw.date_modified),
    completedAt: toIso(raw.date_completed),
    expiresAt: toIso(raw.expiration_date),
    platform: 'pandadoc',
    metadata: strMap(raw.metadata),
    raw,
  }
}
