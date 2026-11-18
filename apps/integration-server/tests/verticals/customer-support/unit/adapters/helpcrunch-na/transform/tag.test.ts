import { describe, it, expect } from 'vitest'
import {
  transformTag,
  type RawInvGateCategory,
} from '../../../../../../../src/verticals/customer-support/adapters/helpcrunch-na/transform/tag'
import { TagSchema } from '../../../../../../../src/verticals/customer-support/schema/tag'

describe('helpcrunch-na transformTag', () => {
  const raw: RawInvGateCategory = {
    id: 15,
    name: 'Hardware Issues',
    parent_category_id: 3,
  }

  it('maps id to string id and externalId', () => {
    const result = transformTag(raw)
    expect(result.id).toBe('15')
    expect(result.externalId).toBe('15')
  })

  it('maps name field', () => {
    const result = transformTag(raw)
    expect(result.name).toBe('Hardware Issues')
  })

  it('sets platform to helpcrunch-na', () => {
    const result = transformTag(raw)
    expect(result.platform).toBe('helpcrunch-na')
  })

  it('stores parentCategoryId in metadata', () => {
    const result = transformTag(raw)
    expect(result.metadata['parentCategoryId']).toBe('3')
  })

  it('produces a TagSchema-valid result', () => {
    const result = transformTag(raw)
    expect(() => TagSchema.parse(result)).not.toThrow()
  })

  it('handles missing name — defaults to empty string', () => {
    const noName: RawInvGateCategory = { id: 99, name: null }
    const result = transformTag(noName)
    expect(result.name).toBe('')
    expect(() => TagSchema.parse(result)).not.toThrow()
  })

  it('omits parentCategoryId from metadata when null', () => {
    const topLevel: RawInvGateCategory = { id: 1, name: 'Root', parent_category_id: null }
    const result = transformTag(topLevel)
    expect(result.metadata['parentCategoryId']).toBeUndefined()
  })
})
