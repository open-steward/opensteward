/**
 * Fixture is the documented "Get tags" example item (docs.blip.ai, response
 * to GET /tags/active).
 */
import { describe, expect, it } from 'vitest'
import { TagSchema } from '../../../../../../../src/verticals/customer-support/schema/tag'
import { transformTag } from '../../../../../../../src/verticals/customer-support/adapters/take-blip/transform/tag'

describe('take-blip transformTag', () => {
  it('maps the documented active tag through the canonical schema, name as id', () => {
    const out = TagSchema.parse(transformTag({ name: 'tag1', closedTickets: 0, ticketsCount: 0 }))
    expect(out).toMatchObject({
      id: 'tag1',
      externalId: 'tag1',
      name: 'tag1',
      platform: 'take-blip',
      metadata: { closedTickets: '0', ticketsCount: '0' },
    })
    expect(out.color).toBeUndefined()
  })

  it('throws on a tag without a name', () => {
    expect(() => transformTag({ ticketsCount: 1 })).toThrow(/no name/)
  })
})
