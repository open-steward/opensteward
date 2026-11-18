import { describe, it, expect } from 'vitest'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'
import {
  transformActivity,
  untransformActivity,
  type RawSalesmateActivity,
} from '../../../../../../../src/verticals/crm/adapters/salesmate/transform/activity'

/**
 * "Get an activity" publishes no example body. Built from the documented "Add
 * an activity" body (values verbatim: "title": "Call Engineer",
 * "description": "Call Rapidops engineer", "type": "Call", "isCompleted":
 * false, "primaryContact": 1354, "dueDate": "", "duration": 0; add response
 * "id": 589), with related records in the `activity.primaryContact.id` /
 * `activity.relatedTo.id` / `activity.owner.id` shape the Search an activity
 * body names. No activity response is documented, so the createdAt /
 * lastModifiedAt values, the `{ id }` ref-object shape and primaryCompany 38
 * are the documented Get a Contact response's ("createdAt":
 * "2020-08-21T11:51:34.000Z", "lastModifiedAt": "2023-07-14T07:15:38.000Z",
 * "company": { "id": 38, … }); relatedTo 341 is the Add a deal response id.
 */
function documentedActivity(): RawSalesmateActivity {
  return {
    id: 589,
    title: 'Call Engineer',
    dueDate: '',
    description: 'Call Rapidops engineer',
    type: 'Call',
    duration: 0,
    tags: 'rapidops,Engineer',
    owner: { id: 1 },
    isCompleted: false,
    primaryContact: { id: 1354 },
    primaryCompany: { id: 38 },
    relatedTo: { id: 341 },
    createdAt: '2020-08-21T11:51:34.000Z',
    lastModifiedAt: '2023-07-14T07:15:38.000Z',
  }
}

describe('salesmate transformActivity', () => {
  it('maps a documented activity and passes ActivitySchema', () => {
    const out = ActivitySchema.parse(transformActivity(documentedActivity()))
    expect(out).toMatchObject({
      id: '589',
      type: 'Call',
      subject: 'Call Engineer',
      note: 'Call Rapidops engineer',
      done: false,
      contact_id: '1354',
      company_id: '38',
      deal_id: '341',
      owner_id: '1',
      created_at: '2020-08-21T11:51:34.000Z',
      updated_at: '2023-07-14T07:15:38.000Z',
    })
  })

  it('maps isCompleted true to done', () => {
    expect(transformActivity({ ...documentedActivity(), isCompleted: true }).done).toBe(true)
  })

  it('leaves dueDate and duration (no documented unit) out of the canonical fields', () => {
    const out = transformActivity({ ...documentedActivity(), dueDate: 1700000000, duration: 45 })
    expect(out.due_date).toBeUndefined()
    expect(out.duration_minutes).toBeUndefined()
    expect(out.metadata['duration']).toBe(45)
  })

  it('throws when the id is missing', () => {
    const raw = documentedActivity()
    delete raw.id
    expect(() => transformActivity(raw)).toThrow(/no id/)
  })
})

describe('salesmate untransformActivity', () => {
  it('maps subject to title', () => {
    expect(untransformActivity({ subject: 'x' }).title).toBe('x')
  })
})
