import type { Envelope, EnvelopeStatus } from '../../../schema/envelope'
import { pickStr, strMap, toIso } from './shared'
import type { RawBreezedocRecipient } from './signer'

/**
 * BreezeDoc document (the canonical "envelope"). BreezeDoc has no top-level
 * status field; completion is derived from its recipients. A document with
 * `is_template: true` is a template, handled by the template transform.
 */
export interface RawBreezedocDocument {
  id: number | string
  title?: string
  slug?: string
  created_at?: string | null
  updated_at?: string | null
  document_files?: Array<{ id: number | string; document_file_pages?: Array<unknown> }>
  fields?: Array<{ id: number | string; recipient_field?: Record<string, unknown> }>
  recipients?: RawBreezedocRecipient[]
  is_template?: boolean
  [key: string]: unknown
}

function nonOwnerRecipients(raw: RawBreezedocDocument): RawBreezedocRecipient[] {
  return (raw.recipients ?? []).filter((r) => !r.owner)
}

function mapStatus(raw: RawBreezedocDocument): EnvelopeStatus {
  const signers = nonOwnerRecipients(raw)
  if (signers.length === 0) return 'draft'
  if (signers.every((r) => r.completed_at)) return 'completed'
  if (signers.some((r) => r.opened_at)) return 'delivered'
  if (signers.some((r) => r.sent_at)) return 'sent'
  return 'draft'
}

function signingOrder(raw: RawBreezedocDocument): 'parallel' | 'sequential' {
  const parties = nonOwnerRecipients(raw).map((r) => Number(r.party ?? 0))
  return new Set(parties).size > 1 ? 'sequential' : 'parallel'
}

function orderedSignerIds(raw: RawBreezedocDocument): string[] {
  return [...nonOwnerRecipients(raw)]
    .sort((a, b) => Number(a.party ?? 0) - Number(b.party ?? 0))
    .map((r) => String(r.id))
}

function maxTimestamp(raw: RawBreezedocDocument, key: 'sent_at' | 'completed_at'): string | undefined {
  const times = (raw.recipients ?? [])
    .map((r) => r[key])
    .filter((t): t is string => typeof t === 'string' && t.length > 0)
    .map((t) => toIso(t))
    .filter((t): t is string => t != null)
  if (times.length === 0) return undefined
  return times.sort()[times.length - 1]
}

export function transformEnvelope(raw: RawBreezedocDocument): Envelope {
  const documentId = String(raw.id)
  const owner = (raw.recipients ?? []).find((r) => r.owner)
  return {
    id: documentId,
    externalId: documentId,
    status: mapStatus(raw),
    subject: pickStr(raw.title) ?? '',
    senderEmail: pickStr(owner?.email),
    senderName: pickStr(owner?.name),
    signingOrder: signingOrder(raw),
    signerIds: orderedSignerIds(raw),
    documentIds: (raw.document_files ?? []).map((f) => `${documentId}:${String(f.id)}`),
    createdAt: toIso(raw.created_at),
    sentAt: maxTimestamp(raw, 'sent_at'),
    completedAt: raw.recipients && mapStatus(raw) === 'completed'
      ? maxTimestamp(raw, 'completed_at')
      : undefined,
    updatedAt: toIso(raw.updated_at),
    platform: 'breezedoc',
    metadata: strMap({
      slug: raw.slug,
      fieldCount: (raw.fields ?? []).length,
      fileCount: (raw.document_files ?? []).length,
    }),
    raw,
  }
}
