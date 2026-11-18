/**
 * Richpanel tag transform, from the documented List Tags response.
 *
 * https://developer.richpanel.com/reference/list-tags (append .md for the spec):
 *   "{\n  \"tag\": [\n    {\n      \"id\": \"0d42c3e0-6189-4157-91e4-a3f349c8e1ed\",\n
 *    \"updated_at\": \"2021-04-28T07:42:11.244Z\",\n      \"organization_id\": \"idontknow436\",\n
 *    \"created_at\": \"2021-04-28T07:42:11.244Z\",\n      \"description\": \"Not Available\",\n
 *    \"name\": \"damaged-items\"\n    }, ..."
 */
import { describe, expect, it } from 'vitest'
import { TagSchema } from '../../../../../../../src/verticals/customer-support/schema/tag'
import { transformTag } from '../../../../../../../src/verticals/customer-support/adapters/richpanel/transform/tag'

const documented = {
  id: '0d42c3e0-6189-4157-91e4-a3f349c8e1ed',
  updated_at: '2021-04-28T07:42:11.244Z',
  organization_id: 'idontknow436',
  created_at: '2021-04-28T07:42:11.244Z',
  description: 'Not Available',
  name: 'damaged-items',
}

describe('richpanel transformTag', () => {
  it('maps the documented tag object onto the canonical Tag', () => {
    const out = TagSchema.parse(transformTag(documented))
    expect(out.id).toBe('0d42c3e0-6189-4157-91e4-a3f349c8e1ed')
    expect(out.externalId).toBe('0d42c3e0-6189-4157-91e4-a3f349c8e1ed')
    expect(out.name).toBe('damaged-items')
    expect(out.platform).toBe('richpanel')
    expect(out.metadata).toEqual({
      description: 'Not Available',
      organization_id: 'idontknow436',
      created_at: '2021-04-28T07:42:11.244Z',
      updated_at: '2021-04-28T07:42:11.244Z',
    })
    expect(out.color).toBeUndefined()
    expect(out.raw).toEqual(documented)
  })

  it('keys the tag by its documented id, not its name (tickets take tag ids)', () => {
    const out = transformTag({ id: 'tag-uuid', name: 'urgent' })
    expect(out.id).toBe('tag-uuid')
  })

  it('throws when the documented id is missing rather than inventing one', () => {
    expect(() => transformTag({ name: 'urgent' } as never)).toThrow(/id/)
  })

  it('throws when the documented id is an empty string rather than keying by it', () => {
    expect(() => transformTag({ id: '', name: 'x' })).toThrow(/id/)
  })

  it('throws when the documented name is missing rather than defaulting it', () => {
    expect(() => transformTag({ id: 'x' } as never)).toThrow(/name/)
  })
})
