import { describe, it, expect } from 'vitest'
import {
  transformDocument,
  type RawLleidaNetFile,
} from '../../../../../../../src/verticals/docsign/adapters/lleida-net/transform/document'
import { DocumentSchema } from '../../../../../../../src/verticals/docsign/schema/document'

/**
 * Fixture: the `file_list.files[0]` element of the documented GET_FILE_LIST
 * response example (https://api.lleida.net/dtd/clickandsign/v1/en/).
 */
const raw: RawLleidaNetFile = {
  signatory_id: '1111000002',
  filename: 'Test.pdf',
  file_group: 'llistat',
  file_id: 12,
  status: 'available',
}

describe('lleida-net transformDocument', () => {
  it('parses against DocumentSchema', () => {
    const result = DocumentSchema.parse(transformDocument(raw, '1111000000', 0))
    expect(result.id).toBe('1111000000:12')
  })

  it('reads externalId from the documented file_id', () => {
    const result = DocumentSchema.parse(transformDocument(raw, '1111000000', 0))
    expect(result.externalId).toBe('12')
  })

  it('reads name from the documented filename', () => {
    const result = DocumentSchema.parse(transformDocument(raw, '1111000000', 0))
    expect(result.name).toBe('Test.pdf')
  })

  it('takes envelopeId and order from the caller', () => {
    const result = DocumentSchema.parse(transformDocument(raw, '1111000000', 3))
    expect(result.envelopeId).toBe('1111000000')
    expect(result.order).toBe(3)
    expect(result.platform).toBe('lleida-net')
  })

  it('carries the documented file_group, status and signatory_id in metadata', () => {
    const result = DocumentSchema.parse(transformDocument(raw, '1111000000', 0))
    expect(result.metadata).toEqual({
      file_group: 'llistat',
      status: 'available',
      signatory_id: '1111000002',
    })
  })

  it('does not invent a size or mime type the API does not return', () => {
    const result = DocumentSchema.parse(transformDocument(raw, '1111000000', 0))
    expect(result.sizeBytes).toBeUndefined()
    expect(result.mimeType).toBeUndefined()
  })

  it('throws when file_id is missing rather than inventing one', () => {
    expect(() => transformDocument({ ...raw, file_id: undefined }, '1111000000', 0)).toThrow(
      /file_id/,
    )
  })

  it('throws when filename is missing rather than inventing one', () => {
    expect(() => transformDocument({ ...raw, filename: undefined }, '1111000000', 0)).toThrow(
      /filename/,
    )
  })

  it('does not read the undocumented file_name / name keys', () => {
    const legacy = { file_id: 5, file_name: 'x.pdf', name: 'y.pdf' } as RawLleidaNetFile
    expect(() => transformDocument(legacy, 'env', 0)).toThrow(/filename/)
  })

  it('drops the documented signatory-entered `fields` values from raw', () => {
    const withFields: RawLleidaNetFile = {
      ...raw,
      fields: [{ name: 'iban', value: 'ES00 0000 0000 0000 0000 0000' }],
    }
    const result = DocumentSchema.parse(transformDocument(withFields, '1111000000', 0))
    expect(result.raw).not.toHaveProperty('fields')
    expect(JSON.stringify(result)).not.toContain('ES00')
    expect(result.raw).toMatchObject({ file_id: 12, filename: 'Test.pdf' })
  })
})
