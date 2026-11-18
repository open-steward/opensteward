/**
 * Sign files: sign.document (19.0+) or the template's attachment_id (18.0),
 * with name / mimetype / file_size from ir.attachment (odoo/odoo 19.0
 * odoo/addons/base/models/ir_attachment.py).
 */
import { describe, expect, it } from 'vitest'
import { DocumentSchema } from '../../../../../../../src/verticals/docsign/schema/document'
import {
  ATTACHMENT_FIELDS,
  transformDocument,
} from '../../../../../../../src/verticals/docsign/adapters/odoo-sign/transform/document'

const attachment = {
  id: 1913,
  name: 'DISPLAY RIGHTS AGREEMENT.pdf',
  mimetype: 'application/pdf',
  file_size: 248320,
}

describe('odoo-sign transformDocument', () => {
  it('maps a 19.0 sign.document with its attachment', () => {
    const d = DocumentSchema.parse(
      transformDocument(
        { model: 'sign.document', id: 61, attachmentId: 1913, attachmentName: 'x.pdf' },
        attachment,
        '5',
        0,
      ),
    )
    expect(d).toMatchObject({
      id: '5:61',
      externalId: '61',
      envelopeId: '5',
      name: 'DISPLAY RIGHTS AGREEMENT.pdf',
      sizeBytes: 248320,
      mimeType: 'application/pdf',
      order: 0,
      platform: 'odoo-sign',
    })
    expect(d.metadata).toEqual({ model: 'sign.document', attachmentId: '1913' })
  })

  it('maps an 18.0 template attachment, whose id is the attachment id', () => {
    const d = DocumentSchema.parse(
      transformDocument(
        { model: 'ir.attachment', id: 1913, attachmentId: 1913 },
        attachment,
        '7',
        0,
      ),
    )
    expect(d).toMatchObject({ id: '7:1913', externalId: '1913' })
    expect(d.metadata).toEqual({ model: 'ir.attachment', attachmentId: '1913' })
  })

  it('falls back to the attachment display name when the attachment is not readable', () => {
    const d = DocumentSchema.parse(
      transformDocument(
        { model: 'sign.document', id: 62, attachmentId: 1914, attachmentName: 'Waiver.pdf' },
        undefined,
        '5',
        1,
      ),
    )
    expect(d).toMatchObject({ name: 'Waiver.pdf', order: 1 })
    expect(d.sizeBytes).toBeUndefined()
    expect(d.mimeType).toBeUndefined()
  })

  it('tolerates attachment fields the server lacks or leaves empty', () => {
    const d = DocumentSchema.parse(
      transformDocument(
        { model: 'sign.document', id: 63 },
        { id: 1, name: false, mimetype: false, file_size: false },
        '5',
        2,
      ),
    )
    expect(d).toMatchObject({ id: '5:63', name: '' })
    expect(d.metadata).toEqual({ model: 'sign.document' })
  })

  it('never asks for the attachment content', () => {
    expect(ATTACHMENT_FIELDS).not.toContain('datas')
    expect(ATTACHMENT_FIELDS).not.toContain('raw')
  })
})
