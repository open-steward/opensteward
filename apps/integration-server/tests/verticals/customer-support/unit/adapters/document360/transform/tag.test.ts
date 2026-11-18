import { describe, it, expect } from 'vitest'
import {
  transformTag,
  type RawDocument360Category,
} from '../../../../../../../src/verticals/customer-support/adapters/document360/transform/tag'
import { TagSchema } from '../../../../../../../src/verticals/customer-support/schema/tag'

describe('document360 transformTag', () => {
  const raw: RawDocument360Category = {
    id: 'cat-7',
    name: 'Getting Started',
    parent_category_id: 'cat-1',
    order: 2,
    created_at: '2024-01-10T08:00:00.000Z',
  }

  it('maps id and externalId from raw.id', () => {
    const result = transformTag(raw)
    expect(result.id).toBe('cat-7')
    expect(result.externalId).toBe('cat-7')
  })

  it('maps name field', () => {
    const result = transformTag(raw)
    expect(result.name).toBe('Getting Started')
  })

  it('sets platform to document360', () => {
    const result = transformTag(raw)
    expect(result.platform).toBe('document360')
  })

  it('stores parentCategoryId in metadata', () => {
    const result = transformTag(raw)
    expect(result.metadata['parentCategoryId']).toBe('cat-1')
  })

  it('stores order in metadata', () => {
    const result = transformTag(raw)
    expect(result.metadata['order']).toBe('2')
  })

  it('produces a TagSchema-valid result', () => {
    const result = transformTag(raw)
    expect(() => TagSchema.parse(result)).not.toThrow()
  })

  it('handles minimal input — missing name defaults to empty string', () => {
    const minimal: RawDocument360Category = { id: 'cat-min' }
    const result = transformTag(minimal)
    expect(result.name).toBe('')
    expect(() => TagSchema.parse(result)).not.toThrow()
  })

  it('handles null parent_category_id — not added to metadata', () => {
    const withNullParent: RawDocument360Category = {
      id: 'cat-top',
      name: 'Top',
      parent_category_id: null,
    }
    const result = transformTag(withNullParent)
    expect(result.metadata['parentCategoryId']).toBeUndefined()
  })
})
