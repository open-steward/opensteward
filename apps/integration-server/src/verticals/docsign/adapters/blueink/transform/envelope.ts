import type { Envelope, EnvelopeStatus } from '../../../schema/envelope'
import { pickStr, strMap, toIsoDatetime } from './shared'

/**
 * Blueink Bundle → canonical Envelope. A Bundle is Blueink's envelope: it
 * groups the documents, the signer "packets", and the event log. The Bundle
 * `id` (slug) addresses all nested resources.
 */
export interface RawBlueinkPacket {
  key?: string
  id?: string
  name?: string
  email?: string
  phone?: string
  status?: string
  deliver_via?: string
  person_id?: string
  order?: number | string
  completed_at?: string
  last_accessed_at?: string
  auth_sms?: boolean
  auth_selfie?: boolean
  auth_id?: boolean
  [key: string]: unknown
}

export interface RawBlueinkDocument {
  key?: string
  filename?: string
  file_url?: string
  template_id?: string
  [key: string]: unknown
}

export interface RawBlueinkBundle {
  id: string
  status?: string
  label?: string
  custom_key?: string
  created?: string
  sent?: string
  started?: string
  completed_at?: string
  expired_at?: string
  is_test?: boolean
  in_order?: boolean
  email_subject?: string
  email_message?: string
  sms_message?: string
  requester_email?: string
  requester_name?: string
  cc_emails?: string[]
  docs_ready?: boolean
  doc_status?: string
  packets?: RawBlueinkPacket[]
  documents?: RawBlueinkDocument[]
  tags?: string[]
  errors?: Array<{ code?: string; message?: string }>
  [key: string]: unknown
}

/**
 * Blueink bundle status codes:
 *   ne=new, dr=draft, pe=pending, se=sent, st=started, ca=cancelled,
 *   ex=expired, co=complete, fa=failed.
 */
function mapStatus(raw: string | undefined): EnvelopeStatus {
  switch ((raw ?? '').toLowerCase()) {
    case 'ne':
    case 'dr':
      return 'draft'
    case 'pe':
    case 'se':
      return 'sent'
    case 'st':
      return 'delivered'
    case 'co':
      return 'completed'
    case 'ca':
      return 'voided'
    case 'ex':
      return 'expired'
    case 'fa':
      return 'declined'
    default:
      return 'draft'
  }
}

export function transformEnvelope(raw: RawBlueinkBundle): Envelope {
  const sortedPackets = [...(raw.packets ?? [])].sort(
    (a, b) => Number(a.order ?? 0) - Number(b.order ?? 0),
  )
  return {
    id: raw.id,
    externalId: raw.id,
    status: mapStatus(raw.status),
    subject: raw.label ?? raw.email_subject ?? '',
    message: pickStr(raw.email_message),
    senderEmail: pickStr(raw.requester_email),
    senderName: pickStr(raw.requester_name),
    signingOrder: raw.in_order ? 'sequential' : 'parallel',
    signerIds: sortedPackets.map((p) => p.id ?? p.key ?? '').filter((id) => id.length > 0),
    documentIds: (raw.documents ?? []).map((d) => d.key ?? '').filter((k) => k.length > 0),
    createdAt: toIsoDatetime(raw.created),
    sentAt: toIsoDatetime(raw.sent),
    completedAt: toIsoDatetime(raw.completed_at),
    expiresAt: toIsoDatetime(raw.expired_at),
    platform: 'blueink',
    metadata: strMap({
      customKey: raw.custom_key,
      isTest: raw.is_test,
      docsReady: raw.docs_ready,
      docStatus: raw.doc_status,
      tags: (raw.tags ?? []).join(','),
      error: raw.errors?.[0]?.message,
    }),
    raw,
  }
}
