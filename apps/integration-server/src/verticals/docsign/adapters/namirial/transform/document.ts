/**
 * `EnvelopeGetFilesDocument` (an entry of `Documents` on
 * `GET /v6/envelope/{envelopeId}/files`) → canonical Document.
 *
 * Metadata only: the file content (`GET /v6/file/{fileId}`) is never read.
 * The swagger documents no MIME type or byte size for these files, so both
 * are left unset.
 *
 * Swagger: https://demo.esignanywhere.net/swagger/jsons/swagger.v6.json
 */
import type { Document } from '../../../schema/document'
import type { RawNamirialEnvelopeDocument } from '../types'
import { pickNum, pickStr, strMap } from './shared'

/** Composite Document id: files are only listed through their envelope. */
export function documentId(envelopeId: string, raw: RawNamirialEnvelopeDocument): string {
  const fileId = pickStr(raw.FileId)
  if (!fileId) throw new Error(`Namirial envelope ${envelopeId} lists a document without a FileId`)
  return `${envelopeId}:${fileId}`
}

export function transformDocument(raw: RawNamirialEnvelopeDocument, envelopeId: string): Document {
  const id = documentId(envelopeId, raw)
  const name = pickStr(raw.FileName)
  if (!name) throw new Error(`Namirial document ${String(raw.FileId)} has no FileName`)
  // DocumentNumber: "The reference number of the document. It starts with 1."
  const number = raw.DocumentNumber
  if (typeof number !== 'number' || !Number.isInteger(number) || number < 1) {
    throw new Error(`Namirial document ${String(raw.FileId)} has no DocumentNumber`)
  }
  return {
    id,
    externalId: pickStr(raw.FileId)!,
    envelopeId,
    name,
    pageCount: pickNum(raw.PageCount),
    order: number - 1,
    platform: 'namirial',
    metadata: strMap({
      auditTrailFileId: raw.AuditTrailFileId,
      attachmentCount: raw.Attachments?.length,
    }),
    raw,
  }
}
