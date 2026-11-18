/**
 * Totango timeline event → canonical Activity.
 *
 * Touchpoints API: "Use the type property to distinguish between touchpoints
 * (type=’note’), tasks (type=’task’), and other items." Search API (events):
 * "Optional values for event_type are "note" (touchpoint), "campaign_touch:
 * (campaigns event), "alert" (health change), "task" (task event - created,
 * updated, completed)".
 */
import { describe, it, expect } from 'vitest'
import {
  transformActivity,
  untransformActivity,
} from '../../../../../../../src/verticals/crm/adapters/totango/transform/activity'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'
import { searchedEvent, touchpointEvent } from '../fixtures'

describe('totango transformActivity', () => {
  it('parses the documented Search API (events) sample with ActivitySchema', () => {
    const out = ActivitySchema.parse(transformActivity(searchedEvent()))
    expect(out).toMatchObject({
      id: '1233',
      type: 'note',
      subject: 'Task/Touchpoint Migration',
      note: ' @person1 @person2 Please let me know when I can start the process.\n ',
      company_id: 'ACCOUNT_ID',
      owner_id: 'someone@totango.com',
      created_at: new Date(1588493035000).toISOString(),
    })
  })

  it('parses the documented Touchpoints API sample, omitting its empty subject', () => {
    const out = ActivitySchema.parse(transformActivity(touchpointEvent()))
    expect(out.subject).toBeUndefined()
    expect(out.owner_id).toBe('user@totango.com')
  })

  it('maps an event without note_content (e.g. an alert) without inventing a body', () => {
    const raw = { id: 'e-9', timestamp: 1588493035000, type: 'alert', account: { id: '42' } }
    const out = ActivitySchema.parse(transformActivity(raw))
    expect(out.type).toBe('alert')
    expect(out.note).toBeUndefined()
    expect(out.owner_id).toBeUndefined()
  })

  it('keeps the raw event as metadata', () => {
    const raw = searchedEvent()
    expect(transformActivity(raw).metadata).toBe(raw)
  })

  it('throws on an event without an id rather than inventing one', () => {
    const raw = { ...searchedEvent(), id: undefined } as unknown as ReturnType<typeof searchedEvent>
    expect(() => transformActivity(raw)).toThrow(/id/)
  })
})

describe('totango untransformActivity', () => {
  it('maps to the documented touchpoint create fields', () => {
    expect(
      untransformActivity({
        type: 'escalation',
        note: 'body',
        subject: 's',
        company_id: '0000',
        owner_id: 'a@b.test',
      }),
    ).toEqual({
      activity_type_id: 'escalation',
      content: 'body',
      subject: 's',
      account_id: '0000',
      created_by: 'a@b.test',
    })
  })

  it('omits undefined fields', () => {
    expect(untransformActivity({})).toEqual({})
  })
})
