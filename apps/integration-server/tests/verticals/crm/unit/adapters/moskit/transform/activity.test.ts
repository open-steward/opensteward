/**
 * Fixture fields are Activity.v2.yaml's:
 * https://stoplight.io/api/v1/projects/moskit/api-v2/nodes/models/Activity.v2.yaml
 */
import { describe, it, expect } from 'vitest'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'
import {
  transformActivity,
  untransformActivity,
  type RawMoskitActivity,
} from '../../../../../../../src/verticals/crm/adapters/moskit/transform/activity'

function documented(): RawMoskitActivity {
  return {
    id: 400,
    title: 'Discovery call',
    createdBy: { id: 7 },
    responsible: { id: 8 },
    doneUser: { id: 8 },
    source: 'MOSKIT_API_V2',
    dateCreated: '2020-07-08T18:18:50.000+00:00',
    dueDate: '2020-07-10T15:00:00.000+00:00',
    doneDate: '2020-07-10T15:30:00.000+00:00',
    type: { id: 3 },
    duration: 30,
    notes: 'Agenda',
    contacts: [{ id: 101 }],
    deals: [{ id: 300 }],
    companies: [{ id: 20 }],
  }
}

describe('moskit transformActivity', () => {
  it('maps the documented fields and satisfies the schema', () => {
    const out = ActivitySchema.parse(transformActivity(documented()))
    expect(out).toMatchObject({
      id: '400',
      subject: 'Discovery call',
      note: 'Agenda',
      contact_id: '101',
      company_id: '20',
      deal_id: '300',
      owner_id: '8',
      due_date: '2020-07-10T15:00:00.000Z',
      done: true,
      duration_minutes: 30,
      created_at: '2020-07-08T18:18:50.000Z',
    })
  })

  it('is not done without a doneDate', () => {
    const { doneDate: _d, ...open } = documented()
    expect(ActivitySchema.parse(transformActivity(open)).done).toBe(false)
  })

  it('does not map the type reference as a kind name', () => {
    expect(ActivitySchema.parse(transformActivity(documented())).type).toBeUndefined()
  })

  it('leaves links unset when several records are related', () => {
    const raw = { ...documented(), contacts: [{ id: 1 }, { id: 2 }] }
    expect(ActivitySchema.parse(transformActivity(raw)).contact_id).toBeUndefined()
  })

  it('parses a record with only the id', () => {
    expect(ActivitySchema.parse(transformActivity({ id: 1 })).id).toBe('1')
  })

  it('keeps the raw payload as metadata', () => {
    const raw = documented()
    expect(transformActivity(raw).metadata).toBe(raw)
  })

  it('untransforms back to platform shape', () => {
    const result = untransformActivity({ subject: 'Test', type: 'meeting' })
    expect(result.subject).toBe('Test')
    expect(result.type).toBe('meeting')
  })
})
