/**
 * Fixture: the POST /uapi/tags sample response,
 * https://api.usedocs.com/article/51382.
 */
import { describe, expect, it } from 'vitest'
import { TagSchema } from '../../../../../../../src/verticals/customer-support/schema/tag'
import { transformTag } from '../../../../../../../src/verticals/customer-support/adapters/usedesk/transform/tag'
import { transformTicket } from '../../../../../../../src/verticals/customer-support/adapters/usedesk/transform/ticket'

const documented = [
  { ticket_tag_id: 130, tag_company_id: 153909, name: 'tag1', ticket_count: 2 },
  { ticket_tag_id: 374, tag_company_id: 153909, name: 'example', ticket_count: 25 },
]

describe('usedesk transformTag (documented tag)', () => {
  it('parses against TagSchema', () => {
    const out = TagSchema.parse(transformTag(documented[0]!))
    expect(out).toEqual({
      id: 'tag1',
      externalId: '130',
      name: 'tag1',
      platform: 'usedesk',
      metadata: { ticketCount: '2', companyId: '153909' },
      raw: documented[0],
    })
  })

  it("a ticket's tagIds resolve to tag ids (tickets carry only the tag name)", () => {
    const ticket = transformTicket({ id: 1, tags: [{ name: 'example' }] })
    const ids = documented.map((t) => transformTag(t).id)
    expect(ticket.tagIds.every((id) => ids.includes(id))).toBe(true)
  })

  it('throws on a row with no ticket_tag_id or no name', () => {
    expect(() => transformTag({ ...documented[0]!, ticket_tag_id: undefined })).toThrow(
      /ticket_tag_id/,
    )
    expect(() => transformTag({ ...documented[0]!, name: undefined })).toThrow(/no name/)
  })
})
