import { describe, it, expect } from 'vitest'
import { TagSchema } from '../../../../../../../src/verticals/customer-support/schema'
import { transformTag } from '../../../../../../../src/verticals/customer-support/adapters/comm100/transform/tag'
import { DOC_TAG } from '../fixtures'

describe('comm100 transformTag', () => {
  it('maps the documented tag example', () => {
    const t = TagSchema.parse(transformTag(DOC_TAG))
    expect(t.id).toBe('bdf96bad-890f-4af5-8f4e-42d2cc29e61b')
    expect(t.name).toBe('my tag')
  })

  it('throws on a tag with no id rather than using its name as one', () => {
    expect(() => transformTag({ name: 'urgent' })).toThrow(/tag id/)
  })
})
