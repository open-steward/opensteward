import { describe, it, expect } from 'vitest'
import { TagSchema } from '../../../../../../../src/verticals/customer-support/schema'
import { transformTag } from '../../../../../../../src/verticals/customer-support/adapters/helpwise/transform/tag'
import { DOC_TAG, DOC_TAG_GET } from '../fixtures'

describe('helpwise transformTag', () => {
  it('maps the documented Get Tags element', () => {
    const t = TagSchema.parse(transformTag(DOC_TAG))
    expect(t.id).toBe('1')
    expect(t.externalId).toBe('1')
    expect(t.name).toBe('Tag 1')
    expect(t.color).toBe('rgb(208, 215, 216)')
    expect(t.platform).toBe('helpwise')
    expect(t.metadata).toEqual({
      parentId: '2',
      inbox: 'Helpwise Support',
      createdAt: '2022-08-31 16:50:38',
    })
  })

  it('maps the documented Get Tag body', () => {
    const t = TagSchema.parse(transformTag(DOC_TAG_GET))
    expect(t.color).toBe('#FF0000')
  })

  it('throws on a tag with no id rather than using its name as one', () => {
    expect(() => transformTag({ ...DOC_TAG, id: undefined as unknown as number })).toThrow(/tag id/)
  })

  it('throws on a tag with no name rather than defaulting it to an empty string', () => {
    expect(() => transformTag({ ...DOC_TAG, name: undefined as unknown as string })).toThrow(
      /tag name/,
    )
  })
})
