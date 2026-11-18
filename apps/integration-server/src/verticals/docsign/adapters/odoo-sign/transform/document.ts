import type { Document } from '../../../schema/document'
import { meta, strOrUndef } from '../values'

/**
 * Where a signing file lives depends on the Odoo version, per Odoo's own data
 * (github.com/odoo/industry):
 *   - 19.0+: a `sign.document` row per file,
 *       <record model="sign.document">
 *         <field name="attachment_id" ref="ir_attachment_1913"/>
 *         <field name="template_id" ref="sign_template_6"/>
 *     (museum/data/sign_template.xml, summer_camps/data/sign_document.xml),
 *     and sign.item fields point at it with `document_id`.
 *   - 18.0: one file per template, `sign.template.attachment_id`, and sign.item
 *     fields point at the template with `template_id`
 *     (18.0 museum/data/sign_template.xml).
 * Either way the file is an `ir.attachment`, read for its metadata only:
 *   name = fields.Char('Name', required=True)
 *   file_size = fields.Integer('File Size', readonly=True)
 *   mimetype = fields.Char('Mime Type', readonly=True)
 * (odoo/odoo 19.0 odoo/addons/base/models/ir_attachment.py). `datas` — the
 * content — is never asked for.
 */
export interface OdooSignFile {
  /** 'sign.document' on 19.0+, 'ir.attachment' (the template's own file) on 18.0. */
  model: 'sign.document' | 'ir.attachment'
  id: number
  attachmentId?: number
  /** The attachment many2one's display name, used when the attachment itself cannot be read. */
  attachmentName?: string
}

export interface RawOdooAttachment {
  id: number
  name?: string | false
  mimetype?: string | false
  file_size?: number | false
}

export const SIGN_DOCUMENT_FIELDS = ['id', 'template_id', 'attachment_id']
export const ATTACHMENT_FIELDS = ['id', 'name', 'mimetype', 'file_size']

/**
 * A sign file belongs to a template, which many requests share, so a document
 * id alone names no envelope. The canonical id is `<envelopeId>:<file id>`,
 * the shape getDocument takes; externalId is the Odoo record id.
 */
export function documentId(envelopeId: string, file: Pick<OdooSignFile, 'id'>): string {
  return `${envelopeId}:${file.id}`
}

export function transformDocument(
  file: OdooSignFile,
  attachment: RawOdooAttachment | undefined,
  envelopeId: string,
  order: number,
): Document {
  const size = attachment?.file_size
  return {
    id: documentId(envelopeId, file),
    externalId: String(file.id),
    envelopeId,
    name: strOrUndef(attachment?.name) ?? file.attachmentName ?? '',
    sizeBytes: typeof size === 'number' && Number.isInteger(size) && size >= 0 ? size : undefined,
    mimeType: strOrUndef(attachment?.mimetype),
    order,
    platform: 'odoo-sign',
    metadata: meta({
      model: file.model,
      attachmentId: file.attachmentId !== undefined ? String(file.attachmentId) : undefined,
    }),
    raw: { file, attachment },
  }
}
