import type { Document } from '../../../schema/document'
import { pickStr, strMap } from './shared'

/**
 * A ZealiD Data API document object.
 *
 * Example:
 *   {
 *     "created": "2023-03-27 07:44:14",
 *     "id": "d772e574-...",
 *     "name": "my_document.pdf",
 *     "status": "signed",
 *     "type": "pdf",
 *     "stored_until": "2023-04-26",
 *     "signed": { "expires": 1680266807, "title": "Sign via orpheus", "url": "https://..." }
 *   }
 *
 * NOTE: `signed.url` is a download link to the signed PDF — i.e. document
 * CONTENT. It is deliberately NOT reflected onto the canonical Document
 * (which has no content/url field by design) nor into metadata. Only the
 * non-content signing facts (title, expiry, retention) are surfaced.
 */
export interface RawZealidDocument {
  id?: string
  name?: string
  type?: string
  status?: string
  created?: string
  stored_until?: string
  signed?: {
    expires?: number
    title?: string
    url?: string
  }
  [key: string]: unknown
}

/** Best-effort MIME type from ZealiD's coarse `type` field. */
function mimeFromType(type: string | undefined): string {
  if (!type) return 'application/pdf'
  if (type.toLowerCase() === 'pdf') return 'application/pdf'
  return type
}

export function transformDocument(
  raw: RawZealidDocument,
  customerId: string,
  order: number,
): Document {
  const id = pickStr(raw.id) ?? `${customerId}:doc:${order}`
  const name = pickStr(raw.name) ?? `document-${order}`
  const signed = raw.signed
  return {
    id,
    externalId: id,
    // ZealiD has no envelope concept — documents are scoped to a customer.
    // The customer_id is used as the canonical envelope grouping.
    envelopeId: customerId,
    name,
    mimeType: mimeFromType(pickStr(raw.type)),
    order,
    platform: 'zealid',
    metadata: strMap({
      status: raw.status,
      type: raw.type,
      created: raw.created,
      storedUntil: raw.stored_until,
      signedTitle: signed?.title,
      signedExpires:
        typeof signed?.expires === 'number' ? String(signed.expires) : undefined,
      // signed.url is intentionally omitted — content firewall.
    }),
    raw,
  }
}
