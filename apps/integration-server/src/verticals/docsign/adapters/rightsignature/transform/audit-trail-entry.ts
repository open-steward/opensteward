import type { AuditTrailEntry, AuditTrailEventType } from '../../../schema/audit-trail-entry'
import { strMap, toIso } from './shared'

/**
 * One element of a document's `audits[]`.
 *
 * `GET /public/v1/documents/:id` returns `"audits": []` in its documented
 * example (https://api.rightsignature.com/documentation/resources/v1/documents),
 * so the element shape comes from the same vendor's archived-document example
 * (https://api.rightsignature.com/documentation/resources/v1, archived_documents
 * find_by_original_guid), which is the only place it is written out:
 *
 *   { "id": 34,
 *     "payload": "All parties have signed document. Signed copies sent to: Ad.",
 *     "user_id": 2, "metadata": { "keyword": "executed" }, "account_id": 2,
 *     "created_at": "2020-04-22T00:55:14.000-07:00", "ip_address": null,
 *     "document_id": 5 }
 */
export interface RawRightSignatureAudit {
  id: number | string
  payload?: string
  user_id?: number | string | null
  metadata?: { keyword?: string } | null
  account_id?: number | string | null
  created_at?: string
  ip_address?: string | null
  document_id?: number | string | null
}

/**
 * `metadata.keyword` values the documented example shows: `created`,
 * `viewed`, `signed`, `executed` ("All parties have signed document").
 * Any other keyword is `other`; a missing one is `unknown`.
 */
function mapKeyword(keyword: string | undefined): AuditTrailEventType {
  if (keyword === undefined || keyword === '') return 'unknown'
  if (keyword === 'created') return 'created'
  if (keyword === 'viewed') return 'viewed'
  if (keyword === 'signed') return 'signed'
  if (keyword === 'executed') return 'completed'
  return 'other'
}

export function transformAuditTrailEntry(
  raw: RawRightSignatureAudit,
  envelopeId: string,
): AuditTrailEntry {
  if (raw.id === undefined || raw.id === null || raw.id === '') {
    throw new Error(`RightSignature audit on document ${envelopeId} has no id`)
  }
  const externalId = String(raw.id)
  const occurredAt = toIso(raw.created_at)
  if (!occurredAt) {
    throw new Error(
      `RightSignature audit ${externalId} on document ${envelopeId} has no created_at`,
    )
  }
  // `payload` is the documented human-readable text of every example audit,
  // and the canonical description is required: missing is an error.
  if (typeof raw.payload !== 'string' || raw.payload === '') {
    throw new Error(`RightSignature audit ${externalId} on document ${envelopeId} has no payload`)
  }
  const keyword = raw.metadata?.keyword
  return {
    id: `${envelopeId}:${externalId}`,
    externalId,
    envelopeId,
    occurredAt,
    eventType: mapKeyword(keyword),
    description: raw.payload,
    actorIp: raw.ip_address ? raw.ip_address : undefined,
    platform: 'rightsignature',
    metadata: strMap({
      keyword,
      user_id: raw.user_id,
      account_id: raw.account_id,
      document_id: raw.document_id,
    }),
    raw,
  }
}
