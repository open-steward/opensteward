import { describe, it, expect } from 'vitest'
import {
  transformTag,
  type RawMissiveSharedLabel,
} from '../../../../../../../src/verticals/customer-support/adapters/missive/transform/tag'
import { TagSchema } from '../../../../../../../src/verticals/customer-support/schema/tag'

describe('missive transformTag', () => {
  const raw: RawMissiveSharedLabel = {
    id: 'label-abc',
    name: 'Billing',
    color: '#e53935',
    description: 'Billing-related tickets',
    visibility: 'shared',
    parent_id: 'label-root',
    organization: { id: 'org-1' },
  }

  it('maps id and externalId from raw.id', () => {
    const result = transformTag(raw)
    expect(result.id).toBe('label-abc')
    expect(result.externalId).toBe('label-abc')
  })

  it('maps name field', () => {
    const result = transformTag(raw)
    expect(result.name).toBe('Billing')
  })

  it('places color in metadata', () => {
    const result = transformTag(raw)
    expect(result.metadata['color']).toBe('#e53935')
  })

  it('places parentId in metadata', () => {
    const result = transformTag(raw)
    expect(result.metadata['parentId']).toBe('label-root')
  })

  it('sets platform to missive', () => {
    const result = transformTag(raw)
    expect(result.platform).toBe('missive')
  })

  it('produces a TagSchema-valid result', () => {
    const result = transformTag(raw)
    expect(() => TagSchema.parse(result)).not.toThrow()
  })

  it('handles null name — falls back to empty string', () => {
    const minimal: RawMissiveSharedLabel = { id: 'lbl-2', name: null }
    const result = transformTag(minimal)
    expect(result.name).toBe('')
    expect(() => TagSchema.parse(result)).not.toThrow()
  })
})
