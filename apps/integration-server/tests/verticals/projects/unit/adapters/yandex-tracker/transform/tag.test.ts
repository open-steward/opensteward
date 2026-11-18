import { describe, it, expect } from 'vitest'
import { transformTag } from '../../../../../../../src/verticals/projects/adapters/yandex-tracker/transform/tag'
import { TagSchema } from '../../../../../../../src/verticals/projects/schema/tag'

/**
 * Fixture: the documented example response of GET /v3/queues/{queue_ID}/tags
 * (https://yandex.ru/support/tracker/en/api/queues/get-tags):
 * `["tag1", "tag2", "tag3"]`.
 */
const DOC_EXAMPLE = ['tag1', 'tag2', 'tag3']

describe('yandex-tracker transformTag', () => {
  it('maps every documented tag string and parses with TagSchema', () => {
    const tags = DOC_EXAMPLE.map((t) => TagSchema.parse(transformTag(t, 'TEST')))
    expect(tags.map((t) => t.name)).toEqual(['tag1', 'tag2', 'tag3'])
  })

  it('uses the tag string as id, externalId and name', () => {
    const tag = TagSchema.parse(transformTag('tag2', 'TEST'))
    expect(tag.id).toBe('tag2')
    expect(tag.externalId).toBe('tag2')
    expect(tag.name).toBe('tag2')
  })

  it('scopes the tag to the queue it was listed from', () => {
    expect(TagSchema.parse(transformTag('tag1', 'QUEUE-7')).workspaceId).toBe('QUEUE-7')
  })

  it('sets no colour (none is documented) and keeps the raw string', () => {
    const tag = TagSchema.parse(transformTag('tag1', 'TEST'))
    expect(tag.color).toBeUndefined()
    expect(tag.platform).toBe('yandex-tracker')
    expect(tag.raw).toBe('tag1')
  })

  it('emits no metadata (the response documents nothing beyond the tag string)', () => {
    expect(TagSchema.parse(transformTag('tag1', 'TEST')).metadata).toEqual({})
  })

  it('throws on an entry that is not a non-empty string', () => {
    expect(() => transformTag('', 'TEST')).toThrow(/not a string/)
    expect(() => transformTag({ name: 'x' } as unknown as string, 'TEST')).toThrow(/not a string/)
  })
})
