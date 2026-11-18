import { describe, it, expect } from 'vitest'
import {
  transformTag,
  type RawMovideskService,
} from '../../../../../../../src/verticals/customer-support/adapters/movidesk/transform/tag'
import { TagSchema } from '../../../../../../../src/verticals/customer-support/schema/tag'

describe('movidesk transformTag', () => {
  const raw: RawMovideskService = {
    id: 7,
    name: 'Billing Inquiry',
    parentServiceId: 1,
    serviceForTicketType: 2,
    isActive: true,
    categories: ['Finance', 'Invoices'],
  }

  it('maps id from raw.id as string', () => {
    const result = transformTag(raw)
    expect(result.id).toBe('7')
    expect(result.externalId).toBe('7')
  })

  it('maps name field', () => {
    const result = transformTag(raw)
    expect(result.name).toBe('Billing Inquiry')
  })

  it('places parentServiceId in metadata', () => {
    const result = transformTag(raw)
    expect(result.metadata['parentServiceId']).toBe('1')
  })

  it('places isActive in metadata', () => {
    const result = transformTag(raw)
    expect(result.metadata['isActive']).toBe('true')
  })

  it('sets platform to movidesk', () => {
    const result = transformTag(raw)
    expect(result.platform).toBe('movidesk')
  })

  it('produces a TagSchema-valid result', () => {
    const result = transformTag(raw)
    expect(() => TagSchema.parse(result)).not.toThrow()
  })

  it('handles null id — id becomes empty string', () => {
    const noId: RawMovideskService = { id: null, name: 'Orphan' }
    const result = transformTag(noId)
    expect(result.id).toBe('')
    expect(() => TagSchema.parse(result)).not.toThrow()
  })
})
