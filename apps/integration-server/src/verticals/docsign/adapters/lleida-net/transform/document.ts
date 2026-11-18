import type { Document } from '../../../schema/document'
import { pickStr, strMap } from './shared'

/**
 * One element of `file_list.files[]` in the GET_FILE_LIST response
 * (https://api.lleida.net/dtd/clickandsign/v1/en/, "files element fields"):
 * signatory_id, filename, file_group, file_id, status, and upload_name /
 * upload_ip for signatory uploads. The API returns no size or MIME type, so
 * the canonical `sizeBytes` / `mimeType` stay unset. Content is never read.
 *
 * `fields` is documented too: "A collection of editable fields within the PDF
 * file designated for completion by the signatory during the signing process,
 * along with their corresponding values upon process completion", returned
 * for START_FILES of finished processes. Those values are document content,
 * which DocumentSchema refuses, so `fields` is dropped from the `raw` passed on.
 */
export interface RawLleidaNetFile {
  signatory_id?: string
  filename?: string
  file_group?: string
  file_id?: number
  status?: string
  upload_name?: string
  upload_ip?: string
  fields?: unknown[]
  [key: string]: unknown
}

export function transformDocument(
  raw: RawLleidaNetFile,
  envelopeId: string,
  index: number,
): Document {
  const externalId = pickStr(raw.file_id)
  if (!externalId) throw new Error('Click & Sign GET_FILE_LIST file has no file_id')
  const name = pickStr(raw.filename)
  if (!name) throw new Error(`Click & Sign GET_FILE_LIST file ${externalId} has no filename`)
  return {
    id: `${envelopeId}:${externalId}`,
    externalId,
    envelopeId,
    name,
    order: index,
    platform: 'lleida-net',
    metadata: strMap({
      file_group: raw.file_group,
      status: raw.status,
      signatory_id: raw.signatory_id,
    }),
    raw: withoutFormValues(raw),
  }
}

/** Signatory-entered form values are content: never pass them through `raw`. */
function withoutFormValues(raw: RawLleidaNetFile): Record<string, unknown> {
  const rest: Record<string, unknown> = { ...raw }
  delete rest.fields
  return rest
}
