import { describe, it, expect } from 'vitest'
import {
  transformTag,
  type RawWeeekTag,
} from '../../../../../../../src/verticals/projects/adapters/weeek/transform/tag'
import { TagSchema } from '../../../../../../../src/verticals/projects/schema/tag'

/**
 * Fixture: the Tag schema's x-examples entry in the spec the Weeek developer
 * portal ships (https://developers.weeek.net/assets/weeek.yaml-Bhx55p8P.js):
 *   "x-examples":{Example:{id:1,title:"Backend",color:"#aaaaaa"}},
 *   required:["title","color","id"]
 */
describe('weeek transformTag', () => {
  const raw: RawWeeekTag = { id: 1, title: 'Backend', color: '#aaaaaa' }

  it('maps the documented example and passes TagSchema.parse', () => {
    const result = TagSchema.parse(transformTag(raw, 'ws_acme'))
    expect(result).toEqual({
      id: '1',
      externalId: '1',
      workspaceId: 'ws_acme',
      name: 'Backend',
      color: '#aaaaaa',
      platform: 'weeek',
      metadata: {},
      raw,
    })
  })

  it('takes workspaceId from the caller (the Tag schema has no workspace field)', () => {
    expect(TagSchema.parse(transformTag(raw, '42')).workspaceId).toBe('42')
  })

  it('throws when the required title is missing rather than inventing a name', () => {
    expect(() => transformTag({ id: 1, color: '#aaaaaa' } as unknown as RawWeeekTag, 'ws')).toThrow(
      /title/,
    )
  })
})
