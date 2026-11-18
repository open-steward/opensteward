import { describe, it, expect } from 'vitest'
import {
  documentFiles,
  transformDocument,
} from '../../../../../../../src/verticals/docsign/adapters/scrive/transform/document'
import { DocumentSchema } from '../../../../../../../src/verticals/docsign/schema/document'
import { documentExample } from '../fixtures'

describe('scrive transformDocument (documented file / sealed_file / author_attachments)', () => {
  it('maps the main and sealed files', () => {
    const doc = documentExample()
    const out = documentFiles(doc).map((f, i) =>
      DocumentSchema.parse(transformDocument(f, doc.id, i)),
    )
    expect(out.map((d) => [d.id, d.name, d.order, d.metadata.kind, d.mimeType])).toEqual([
      ['195124', 'contract.pdf', 0, 'main', 'application/pdf'],
      ['195172', 'contract.pdf', 1, 'sealed', 'application/pdf'],
    ])
    expect(out[0]!.envelopeId).toBe('8222115557375075439')
  })

  it('maps an author attachment by its file_id and claims no mime type', () => {
    const doc = {
      ...documentExample(),
      sealed_file: null,
      author_attachments: [
        {
          name: 'Attachment using ID',
          description: 'Please review carefully',
          required: false,
          add_to_sealed_file: true,
          file_id: '36',
        },
      ],
    }
    const out = documentFiles(doc).map((f, i) =>
      DocumentSchema.parse(transformDocument(f, doc.id, i)),
    )
    expect(out).toHaveLength(2)
    expect(out[1]!.id).toBe('36')
    expect(out[1]!.name).toBe('Attachment using ID')
    expect(out[1]!.metadata.kind).toBe('author_attachment')
    expect(out[1]).not.toHaveProperty('mimeType')
  })

  it('has no documents when there is no file', () => {
    expect(
      documentFiles({ id: '1', file: null, sealed_file: null, author_attachments: [] }),
    ).toEqual([])
  })
})
