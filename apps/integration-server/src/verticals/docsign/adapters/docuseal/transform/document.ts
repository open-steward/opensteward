import type { Document } from '../../../schema/document'
import { pickStr, strMap } from './shared'

/**
 * DocuSeal exposes a submission's signed documents as `{ name, url }` pairs on
 * the submission object and the `GET /submissions/{id}/documents` endpoint.
 * The download `url` is content — REFUSED by the canonical schema (no `url`
 * field). Only the filename is surfaced. Documents are not individually
 * addressable, so the id is synthesised as `<submissionId>:<order>`.
 */
export interface RawDocusealDocument {
  name?: string
  url?: string
  [key: string]: unknown
}

export function transformDocument(
  raw: RawDocusealDocument,
  submissionId: string | number,
  order: number,
): Document {
  const name = pickStr(raw.name) ?? `document-${order}`
  return {
    id: `${submissionId}:${order}`,
    externalId: `${submissionId}:${order}`,
    envelopeId: String(submissionId),
    name,
    mimeType: /\.pdf$/i.test(name) ? 'application/pdf' : undefined,
    order,
    platform: 'docuseal',
    // `url` is content — never surfaced.
    metadata: strMap({}),
    raw: { name: raw.name },
  }
}
