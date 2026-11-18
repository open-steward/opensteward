/**
 * channel-talk transformTag — maps a documented `ChatTag` (Channel Talk Open
 * API, https://api-doc.channel.io/docs/openapi.en.yaml, components.schemas.
 * ChatTag, required: id, channelId, name, key, createdAt) to the canonical Tag.
 *
 * The fixture is the spec's own per-field `example` values.
 */
import { describe, it, expect } from 'vitest'
import { transformTag } from '../../../../../../../src/verticals/customer-support/adapters/channel-talk/transform/tag'
import { TagSchema } from '../../../../../../../src/verticals/customer-support/schema/tag'

const documented = {
  id: '56161',
  channelId: '6263',
  name: 'billing/general',
  key: 'billing/general',
  createdAt: '2024-03-28T08:57:32Z',
  colorVariant: 'cobalt',
  description: 'Billing related inquiries',
}

describe('channel-talk transformTag', () => {
  it('maps the documented ChatTag example and parses with TagSchema', () => {
    const tag = TagSchema.parse(transformTag(documented))
    expect(tag.id).toBe('56161')
    expect(tag.externalId).toBe('56161')
    expect(tag.name).toBe('billing/general')
    expect(tag.platform).toBe('channel-talk')
    expect(tag.metadata).toEqual({
      channelId: '6263',
      key: 'billing/general',
      createdAt: '2024-03-28T08:57:32Z',
      colorVariant: 'cobalt',
      description: 'Billing related inquiries',
    })
    expect(tag.raw).toEqual(documented)
  })

  it('does not put a named colorVariant into the canonical colour field', () => {
    expect(transformTag(documented).color).toBeUndefined()
  })

  it('omits the optional fields when the tag has none', () => {
    const { colorVariant: _c, description: _d, ...required } = documented
    const tag = TagSchema.parse(transformTag(required))
    expect(tag.metadata).toEqual({
      channelId: '6263',
      key: 'billing/general',
      createdAt: '2024-03-28T08:57:32Z',
    })
  })

  it('throws rather than invent an id when the required id is missing', () => {
    const { id: _id, ...noId } = documented
    expect(() => transformTag(noId as unknown as typeof documented)).toThrow(/id/)
  })

  it('throws rather than invent a name when the required name is missing or empty', () => {
    const { name: _name, ...noName } = documented
    expect(() => transformTag(noName as unknown as typeof documented)).toThrow(/56161 has no name/)
    expect(() => transformTag({ ...documented, name: '' })).toThrow(/56161 has no name/)
  })
})
