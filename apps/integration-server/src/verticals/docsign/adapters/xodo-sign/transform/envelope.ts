import type { Envelope, EnvelopeStatus } from '../../../schema/envelope'
import { pickStr, strMap, toIso } from './shared'

/** A signer as it appears on a Xodo Sign document object. */
export interface RawXodoSignSigner {
  id?: number | string
  name?: string
  email?: string
  role?: string
  order?: number | string
  signed?: boolean | number
  signed_timestamp?: number
  declined?: boolean | number
  declined_timestamp?: number
  declined_reason?: string
  sent?: boolean | number
  viewed?: boolean | number
  removed?: boolean | number
  bounced?: boolean | number
  required?: boolean | number
  deliver_email?: boolean | number
  language?: string
  status?: string
  [key: string]: unknown
}

/** A file (PDF) attached to a Xodo Sign document. */
export interface RawXodoSignFile {
  name?: string
  file_id?: string
  pages?: number
  [key: string]: unknown
}

/** A single audit-log entry on a Xodo Sign document. */
export interface RawXodoSignLogEntry {
  event?: string
  signer?: number | string
  timestamp?: number
  [key: string]: unknown
}

/**
 * The Xodo Sign document object — the canonical Envelope source. Used by the
 * envelope, signer, document, and audit-trail transforms since Xodo Sign
 * nests all of those under one document payload.
 */
export interface RawXodoSignDocument {
  document_hash: string
  title?: string
  message?: string
  requester_email?: string
  custom_requester_name?: string
  custom_requester_email?: string
  is_draft?: boolean | number
  is_completed?: boolean | number
  is_cancelled?: boolean | number
  is_declined?: boolean | number
  is_deleted?: boolean | number
  is_trashed?: boolean | number
  is_archived?: boolean | number
  is_template?: boolean | number
  use_signer_order?: boolean | number
  template_id?: string
  created?: number
  sent?: number
  completed?: number
  expires?: number
  signers?: RawXodoSignSigner[]
  files?: RawXodoSignFile[]
  log?: RawXodoSignLogEntry[]
  [key: string]: unknown
}

const truthy = (v: unknown): boolean => v === true || v === 1 || v === '1'

function mapStatus(raw: RawXodoSignDocument): EnvelopeStatus {
  if (truthy(raw.is_cancelled)) return 'voided'
  if (truthy(raw.is_declined)) return 'declined'
  if (truthy(raw.is_completed)) return 'completed'
  if (truthy(raw.is_draft)) return 'draft'
  const signers = raw.signers ?? []
  if (signers.some((s) => truthy(s.viewed))) return 'delivered'
  if (signers.some((s) => truthy(s.sent))) return 'sent'
  return 'draft'
}

function signerKey(s: RawXodoSignSigner, index: number): string {
  return String(s.id ?? s.order ?? index + 1)
}

function orderedSignerIds(raw: RawXodoSignDocument): string[] {
  const signers = raw.signers ?? []
  return signers
    .map((s, i) => ({ key: signerKey(s, i), order: Number(s.order ?? i + 1) }))
    .sort((a, b) => a.order - b.order)
    .map((s) => s.key)
}

export function transformEnvelope(raw: RawXodoSignDocument): Envelope {
  return {
    id: raw.document_hash,
    externalId: raw.document_hash,
    status: mapStatus(raw),
    subject: raw.title ?? '',
    message: pickStr(raw.message),
    senderEmail: pickStr(raw.custom_requester_email ?? raw.requester_email),
    senderName: pickStr(raw.custom_requester_name),
    // Sequential when the document enforces signer order; parallel otherwise.
    signingOrder: truthy(raw.use_signer_order) ? 'sequential' : 'parallel',
    signerIds: orderedSignerIds(raw),
    documentIds: (raw.files ?? []).map((f, i) => pickStr(f.file_id) ?? String(i)),
    templateId: truthy(raw.is_template) ? raw.document_hash : pickStr(raw.template_id),
    createdAt: toIso(raw.created),
    sentAt: toIso(raw.sent),
    completedAt: toIso(raw.completed),
    expiresAt: toIso(raw.expires),
    platform: 'xodo-sign',
    metadata: strMap({
      requesterEmail: raw.requester_email,
      isTemplate: truthy(raw.is_template) ? 'true' : undefined,
      isArchived: truthy(raw.is_archived) ? 'true' : undefined,
    }),
    raw,
  }
}
