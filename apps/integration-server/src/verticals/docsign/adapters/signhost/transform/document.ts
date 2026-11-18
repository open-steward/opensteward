/**
 * Signhost `Files` entry -> canonical Document.
 *
 * The Transaction's `Files` is "a key-value mapping. Key is the file ID, value
 * is the file information"
 * (https://developer.signhost.com/openapi/models/Transaction.md). The value is
 * a FileEntry (https://developer.signhost.com/openapi/models/FileEntry.md):
 * `Links` ("Related links for the file (download, etc.)") and `DisplayName`
 * ("Display name for the file"). A Link has `Rel`, `Type` ("MIME type or
 * content type of the linked resource") and `Link`
 * (https://developer.signhost.com/openapi/models/Link.md). No size or page
 * count is documented. The download link itself is not carried: the
 * canonical schema refuses document content and URLs.
 */
import type { Document } from '../../../schema/document'
import { pickStr, strMap } from './shared'

export interface RawSignhostLink {
  Rel?: string
  Type?: string
  Link?: string
}

export interface RawSignhostFileEntry {
  Links?: RawSignhostLink[] | null
  DisplayName?: string
  [key: string]: unknown
}

/** A FileEntry without its `Links` (the file download URLs). */
export function fileEntryWithoutLinks(
  raw: RawSignhostFileEntry,
): Omit<RawSignhostFileEntry, 'Links'> {
  const { Links: _links, ...rest } = raw
  return rest
}

export function transformDocument(
  fileId: string,
  raw: RawSignhostFileEntry,
  envelopeId: string,
  order: number,
): Document {
  const name = pickStr(raw.DisplayName)
  if (!name)
    throw new Error(`signhost file ${fileId} of transaction ${envelopeId} has no DisplayName`)
  // The file ID is unique only within its transaction ("Files are referenced
  // by their unique identifier within the transaction").
  const id = `${envelopeId}:${fileId}`
  return {
    id,
    externalId: fileId,
    envelopeId,
    name,
    mimeType: pickStr((raw.Links ?? []).find((l) => l.Rel === 'file')?.Type),
    order,
    platform: 'signhost',
    metadata: strMap({}),
    raw: { fileId, ...fileEntryWithoutLinks(raw) },
  }
}
