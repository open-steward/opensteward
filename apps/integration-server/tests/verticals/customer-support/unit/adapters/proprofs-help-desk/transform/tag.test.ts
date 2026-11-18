import { describe, it, expect } from 'vitest'
import {
  transformTag,
  type RawProprofsLabel,
} from '../../../../../../../src/verticals/customer-support/adapters/proprofs-help-desk/transform/tag'
import { TagSchema } from '../../../../../../../src/verticals/customer-support/schema/tag'

describe('proprofs-help-desk transformTag', () => {
  it('maps a label with numeric id and name', () => {
    const raw: RawProprofsLabel = {
      id: 5,
      name: 'billing',
    }

    const result = transformTag(raw)

    // id maps from raw.id (as string)
    expect(result.id).toBe('5')
    expect(result.externalId).toBe('5')
    // name maps directly
    expect(result.name).toBe('billing')
    // platform
    expect(result.platform).toBe('proprofs-help-desk')

    expect(() => TagSchema.parse(result)).not.toThrow()
  })

  it('maps a label with string id', () => {
    const raw: RawProprofsLabel = {
      id: 'lbl-007',
      name: 'payment',
    }

    const result = transformTag(raw)

    expect(result.id).toBe('lbl-007')
    expect(result.name).toBe('payment')

    expect(() => TagSchema.parse(result)).not.toThrow()
  })

  it('falls back to name as id when id is absent', () => {
    const raw: RawProprofsLabel = {
      name: 'feature-request',
    }

    const result = transformTag(raw)

    // id falls back to name when raw.id absent
    expect(result.id).toBe('feature-request')
    expect(result.name).toBe('feature-request')

    expect(() => TagSchema.parse(result)).not.toThrow()
  })

  it('produces empty string id and name when both absent', () => {
    const raw: RawProprofsLabel = {}

    const result = transformTag(raw)

    expect(result.id).toBe('')
    expect(result.name).toBe('')

    expect(() => TagSchema.parse(result)).not.toThrow()
  })
})
