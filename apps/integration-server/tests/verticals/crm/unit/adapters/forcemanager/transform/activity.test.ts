import { describe, it, expect } from 'vitest'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'
import {
  transformActivity,
  untransformActivity,
} from '../../../../../../../src/verticals/crm/adapters/forcemanager/transform/activity'
import { ACTIVITIES, ACTIVITY } from '../fixtures'

describe('forcemanager transformActivity (documented GET /activities/{ID} example)', () => {
  const out = transformActivity(ACTIVITY)

  it('parses with the canonical schema', () => {
    expect(() => ActivitySchema.parse(out)).not.toThrow()
    for (const row of ACTIVITIES)
      expect(() => ActivitySchema.parse(transformActivity(row))).not.toThrow()
  })

  it('maps the documented fields', () => {
    expect(out).toMatchObject({
      id: '799',
      type: 'Video call',
      note: 'Take samples',
      due_date: '2015-07-09T10:59:00.000Z',
      company_id: '1186',
      contact_id: '1056',
      deal_id: '823',
      owner_id: '5548',
      created_at: '2015-07-09T11:00:06.137Z',
      updated_at: '2018-06-12T09:20:40.960Z',
    })
  })

  it('does not claim done or a subject: neither is documented', () => {
    expect(out.done).toBeUndefined()
    expect(out.subject).toBeUndefined()
  })

  it('reads a null contactId and an empty comment as absent', () => {
    const r = transformActivity(ACTIVITIES[0]!)
    expect(r.contact_id).toBeUndefined()
    expect(r.note).toBeUndefined()
  })

  it('throws on an activity with no id', () => {
    expect(() => transformActivity({ ...ACTIVITY, id: null })).toThrow(/no id/)
  })

  it('keeps the raw payload as metadata', () => {
    expect(out.metadata).toBe(ACTIVITY)
  })

  it('untransform (write path, unchanged) still maps the note', () => {
    expect(untransformActivity({ note: 'x' })).toEqual({ comment: 'x' })
  })
})
