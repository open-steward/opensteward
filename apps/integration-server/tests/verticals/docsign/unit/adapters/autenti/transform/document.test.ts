import { describe, it, expect } from 'vitest'
import { DocumentSchema } from '../../../../../../../src/verticals/docsign/schema/document'
import { transformDocument } from '../../../../../../../src/verticals/docsign/adapters/autenti/transform/document'
import { filesResponse } from '../fixtures'

const ENV = 'DOCUMENT_PROCESS:xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'

describe('Autenti transformDocument (FileInformation)', () => {
  it('maps every file of the documented files response', () => {
    const out = filesResponse().map((f, i) => DocumentSchema.parse(transformDocument(f, ENV, i)))
    expect(out.map((d) => d.id)).toEqual([
      'FILE-SOURCE_FILE:xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
      'FILE-SIGNED_CONTENT_FILE:yyyyyyyy-yyyy-yyyy-yyyy-yyyyyyyyyyyy/DTBS',
      'FILE-CONTENT_ARCHIVE:zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz/CONTENT_ARCHIVE',
    ])
    expect(out.map((d) => d.name)).toEqual([
      'example.pdf',
      'example_title.pdf',
      'example_title.zip',
    ])
    expect(out.map((d) => d.mimeType)).toEqual([
      'application/pdf',
      'application/pdf',
      'application/zip',
    ])
    expect(out.map((d) => d.order)).toEqual([0, 1, 2])
    expect(out[1]!.metadata).toEqual({ filePurpose: 'SIGNED_CONTENT_FILE', version: '1000' })
    expect(out[0]!.envelopeId).toBe(ENV)
    expect(out[0]!.sizeBytes).toBeUndefined()
  })

  it('throws rather than inventing a filename', () => {
    const { filename: _f, ...noName } = filesResponse()[0]!
    expect(() => transformDocument(noName, ENV, 0)).toThrow(/no filename/)
  })
})
