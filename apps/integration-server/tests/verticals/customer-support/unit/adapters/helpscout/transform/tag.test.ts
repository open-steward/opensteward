/**
 * Fixtures: the documented examples of
 * https://developer.helpscout.com/mailbox-api/endpoints/tags/list/ and
 * https://developer.helpscout.com/mailbox-api/endpoints/tags/get/ (fetched 2026-09-28).
 */
import { describe, it, expect } from 'vitest'
import {
  transformTag,
  type RawHelpScoutTag,
} from '../../../../../../../src/verticals/customer-support/adapters/helpscout/transform/tag'
import { TagSchema } from '../../../../../../../src/verticals/customer-support/schema/tag'

const listed: RawHelpScoutTag = {
  id: 123456794,
  slug: 'the-other-side',
  name: 'The other side',
  color: 'green',
  createdAt: '2010-02-10T09:00:00Z',
  updatedAt: '2010-02-10T10:37:00Z',
  ticketCount: 2,
}

const got: RawHelpScoutTag = { id: 123456793, slug: 'dark-side', name: 'Dark Side', color: 'green' }

describe('helpscout transformTag', () => {
  it('parses the documented list row against TagSchema', () => {
    const out = TagSchema.parse(transformTag(listed))
    expect(out).toMatchObject({
      id: '123456794',
      externalId: '123456794',
      name: 'The other side',
      color: 'green',
      platform: 'helpscout',
    })
    expect(out.metadata).toMatchObject({ slug: 'the-other-side', ticketCount: '2' })
  })

  it('parses the documented get response against TagSchema', () => {
    const out = TagSchema.parse(transformTag(got))
    expect(out.id).toBe('123456793')
    expect(out.name).toBe('Dark Side')
  })
})
