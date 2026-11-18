import { describe, it, expect } from 'vitest'
import {
  transformTag,
  type RawOctadeskTag,
} from '../../../../../../../src/verticals/customer-support/adapters/octadesk/transform/tag'
import { TagSchema } from '../../../../../../../src/verticals/customer-support/schema/tag'

describe('octadesk transformTag', () => {
  const raw: RawOctadeskTag = {
    name: 'billing',
  }

  it('maps name to id and externalId (name is the unique key)', () => {
    const result = transformTag(raw)
    expect(result.id).toBe('billing')
    expect(result.externalId).toBe('billing')
  })

  it('maps name field', () => {
    const result = transformTag(raw)
    expect(result.name).toBe('billing')
  })

  it('sets platform to octadesk', () => {
    const result = transformTag(raw)
    expect(result.platform).toBe('octadesk')
  })

  it('metadata is an empty object (Octadesk tags are plain labels)', () => {
    const result = transformTag(raw)
    expect(result.metadata).toEqual({})
  })

  it('produces a TagSchema-valid result', () => {
    const result = transformTag(raw)
    expect(() => TagSchema.parse(result)).not.toThrow()
  })

  it('handles tags with spaces and mixed case', () => {
    const fancy: RawOctadeskTag = { name: 'Login Issue' }
    const result = transformTag(fancy)
    expect(result.id).toBe('Login Issue')
    expect(result.name).toBe('Login Issue')
    expect(() => TagSchema.parse(result)).not.toThrow()
  })
})
