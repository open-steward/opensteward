import { describe, it, expect } from 'vitest'
import { transformTag } from '../../../../../../../src/verticals/customer-support/adapters/intercom/transform/tag'
import { TagSchema } from '../../../../../../../src/verticals/customer-support/schema/tag'

describe('transformTag (Intercom tag)', () => {
  it('maps id and name and parses', () => {
    expect(
      TagSchema.parse(transformTag({ type: 'tag', id: '102', name: 'Manual tag 1' })),
    ).toMatchObject({
      id: '102',
      externalId: '102',
      name: 'Manual tag 1',
      platform: 'intercom',
      metadata: {},
    })
  })

  it('a numeric id becomes a string', () => {
    expect(TagSchema.parse(transformTag({ id: 5, name: null })).id).toBe('5')
  })
})
