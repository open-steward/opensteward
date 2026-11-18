import type { Document } from '../../../schema/document'
import { strMap } from './shared'
import type { RawScriveDocument } from './envelope'

/**
 * One file of a Scrive document. The "Document" definition at
 * https://apidocs.scrive.com/ carries its files in three documented places:
 *   - `file`: "A file that can be accessed using the API call to download
 *     related files. ... id (string, read only) name (string, read only)"
 *     (the main file; "Get the main PDF file for a document.");
 *   - `sealed_file`: "The cryptographically sealed file. Will only exist for
 *     documents that have been closed.";
 *   - `author_attachments[]`: "name ... description ... required ...
 *     add_to_sealed_file ... file_id".
 */
export interface RawScriveFileEntry {
  kind: 'main' | 'sealed' | 'author_attachment'
  fileId: string
  name?: string
  raw: unknown
}

export function documentFiles(doc: RawScriveDocument): RawScriveFileEntry[] {
  const out: RawScriveFileEntry[] = []
  if (doc.file?.id)
    out.push({ kind: 'main', fileId: doc.file.id, name: doc.file.name, raw: doc.file })
  if (doc.sealed_file?.id)
    out.push({
      kind: 'sealed',
      fileId: doc.sealed_file.id,
      name: doc.sealed_file.name,
      raw: doc.sealed_file,
    })
  for (const a of doc.author_attachments ?? []) {
    if (a.file_id) out.push({ kind: 'author_attachment', fileId: a.file_id, name: a.name, raw: a })
  }
  return out
}

export function documentFileIds(doc: RawScriveDocument): string[] {
  return documentFiles(doc).map((f) => f.fileId)
}

export function transformDocument(
  entry: RawScriveFileEntry,
  envelopeId: string,
  order: number,
): Document {
  return {
    id: entry.fileId,
    externalId: entry.fileId,
    envelopeId,
    name: entry.name ?? '',
    // The main and sealed files are the document's PDF ("Get the main PDF
    // file"); a related file is "Usually an image (JPG, PNG) or PDF, but this
    // may change", so no type is claimed for attachments.
    ...(entry.kind === 'author_attachment' ? {} : { mimeType: 'application/pdf' }),
    order,
    platform: 'scrive',
    metadata: strMap({ kind: entry.kind }),
    raw: entry.raw,
  }
}
