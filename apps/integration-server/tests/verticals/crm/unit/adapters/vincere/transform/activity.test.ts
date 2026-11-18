/**
 * Vincere activity → Activity, over the response examples in Vincere's
 * first-party spec (https://api.vincere.io/vapi.yaml), parsed with the
 * canonical schema.
 */
import { describe, it, expect } from 'vitest'
import {
  transformActivity,
  untransformActivity,
  type RawVincereActivity,
} from '../../../../../../../src/verticals/crm/adapters/vincere/transform/activity'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'
import { DOC_ACTIVITIES_SLICE, DOC_ACTIVITY } from '../fixtures/documented'

const sliceItem = DOC_ACTIVITIES_SLICE.content[0] as unknown as RawVincereActivity
const detail = DOC_ACTIVITY as unknown as RawVincereActivity

describe('vincere transformActivity', () => {
  it('parses the documented POST /activities item with ActivitySchema', () => {
    const a = ActivitySchema.parse(transformActivity(sliceItem))
    expect(a).toMatchObject({
      id: '9999',
      type: 'comment',
      subject: 'string',
      contact_id: '9999',
      owner_id: '9999',
      created_at: '2018-04-05T00:00:00.000Z',
    })
    expect(a.company_id).toBeUndefined()
    expect(a.deal_id).toBeUndefined()
    expect(a.metadata).toEqual(sliceItem)
  })

  it('parses the documented GET /activities/{id} body, reading content and due_date', () => {
    const a = ActivitySchema.parse(transformActivity(detail))
    expect(a.note).toBe('string')
    expect(a.due_date).toBe('2018-04-05T00:00:00.000Z')
  })

  it('reads the note from content ("Content or the description of a comment."), not summary', () => {
    // The documented example has summary and content both 'string'.
    const a = ActivitySchema.parse(
      transformActivity({ ...detail, summary: 'a summary', content: 'the comment body' }),
    )
    expect(a.note).toBe('the comment body')
  })

  it('maps the linked record by entity_type', () => {
    expect(transformActivity({ id: 1, entity_type: 'COMPANY', entity_id: 5 }).company_id).toBe('5')
    expect(transformActivity({ id: 1, entity_type: 'JOB', entity_id: 6 }).deal_id).toBe('6')
    const contact = transformActivity({ id: 1, entity_type: 'CONTACT', entity_id: 7 })
    expect(contact.contact_id).toBeUndefined()
    expect(contact.company_id).toBeUndefined()
    expect(contact.deal_id).toBeUndefined()
  })

  it('throws on an item without an id', () => {
    expect(() => transformActivity({ category: 'TASK' } as unknown as RawVincereActivity)).toThrow(
      /without an id/,
    )
  })
})

describe('vincere untransformActivity', () => {
  it('omits undefined fields', () => {
    expect(untransformActivity({ subject: 'x' })).toEqual({ subject: 'x' })
  })
})
