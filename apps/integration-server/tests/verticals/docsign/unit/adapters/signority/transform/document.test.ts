import { describe, it, expect } from 'vitest'
import {
  transformDocument,
  type RawSignorityFile,
} from '../../../../../../../src/verticals/docsign/adapters/signority/transform/document'
import { DocumentSchema } from '../../../../../../../src/verticals/docsign/schema/document'

const ENVELOPE_ID = 'env-55'

describe('signority transformDocument', () => {
  it('composes id as envelopeId:fileId', () => {
    const raw: RawSignorityFile = { id: 'file-7', name: 'Contract.pdf' }
    const result = transformDocument(raw, ENVELOPE_ID, 0)
    expect(result.id).toBe('env-55:file-7')
    expect(result.externalId).toBe('file-7')
  })

  it('falls back to index when id is absent', () => {
    const raw: RawSignorityFile = { name: 'Exhibit.pdf' }
    const result = transformDocument(raw, ENVELOPE_ID, 3)
    expect(result.id).toBe('env-55:3')
    expect(result.externalId).toBe('3')
  })

  it('maps envelopeId', () => {
    const raw: RawSignorityFile = { id: 'file-7' }
    const result = transformDocument(raw, ENVELOPE_ID, 0)
    expect(result.envelopeId).toBe(ENVELOPE_ID)
  })

  it('maps name from raw.name', () => {
    const raw: RawSignorityFile = { id: 'file-7', name: 'NDA.pdf' }
    const result = transformDocument(raw, ENVELOPE_ID, 0)
    expect(result.name).toBe('NDA.pdf')
  })

  it('uses empty string when name is absent', () => {
    const raw: RawSignorityFile = { id: 'file-7' }
    const result = transformDocument(raw, ENVELOPE_ID, 0)
    expect(result.name).toBe('')
  })

  it('maps page count from pages array length', () => {
    const raw: RawSignorityFile = { id: 'file-7', pages: [{}, {}, {}] }
    const result = transformDocument(raw, ENVELOPE_ID, 0)
    expect(result.pageCount).toBe(3)
  })

  it('leaves pageCount undefined when pages absent', () => {
    const raw: RawSignorityFile = { id: 'file-7' }
    const result = transformDocument(raw, ENVELOPE_ID, 0)
    expect(result.pageCount).toBeUndefined()
  })

  it('maps order from raw.sequence', () => {
    const raw: RawSignorityFile = { id: 'file-7', sequence: 2 }
    const result = transformDocument(raw, ENVELOPE_ID, 0)
    expect(result.order).toBe(2)
  })

  it('falls back to index for order when sequence absent', () => {
    const raw: RawSignorityFile = { id: 'file-7' }
    const result = transformDocument(raw, ENVELOPE_ID, 1)
    expect(result.order).toBe(1)
  })

  it('sets platform to signority', () => {
    const raw: RawSignorityFile = { id: 'file-7', name: 'Contract.pdf' }
    const result = transformDocument(raw, ENVELOPE_ID, 0)
    expect(result.platform).toBe('signority')
  })

  it('passes DocumentSchema.parse without throwing', () => {
    const raw: RawSignorityFile = {
      id: 'file-7',
      name: 'NDA.pdf',
      sequence: 0,
      type: 1,
      pages: [{}, {}],
    }
    const result = transformDocument(raw, ENVELOPE_ID, 0)
    expect(() => DocumentSchema.parse(result)).not.toThrow()
  })
})
