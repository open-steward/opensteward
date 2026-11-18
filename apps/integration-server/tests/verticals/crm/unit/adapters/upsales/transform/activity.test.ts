import { describe, it, expect } from 'vitest'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'
import {
  transformActivity,
  untransformActivity,
} from '../../../../../../../src/verticals/crm/adapters/upsales/transform/activity'
import { ACTIVITY_LIST } from '../fixtures'

describe('upsales transformActivity (documented "Get activity list" sample)', () => {
  it('maps an unlinked to-do', () => {
    const raw = ACTIVITY_LIST.data[0]!
    const a = ActivitySchema.parse(transformActivity(raw))
    expect(a.id).toBe('1')
    expect(a.type).toBe('Todo')
    expect(a.subject).toBe('Talk with Daniel about Salesboard')
    expect(a.note).toBeUndefined()
    expect(a.company_id).toBeUndefined()
    expect(a.contact_id).toBeUndefined()
    expect(a.deal_id).toBeUndefined()
    expect(a.owner_id).toBe('1')
    expect(a.due_date).toBeUndefined()
    expect(a.done).toBe(false)
    expect(a.created_at).toBe('2021-09-29T06:40:28.000Z')
    expect(a.updated_at).toBe('2021-09-29T06:40:28.000Z')
    expect(a.metadata).toEqual(raw)
  })

  it('maps the company and the due date', () => {
    const raw = ACTIVITY_LIST.data[2]!
    const a = ActivitySchema.parse(transformActivity(raw))
    expect(a.company_id).toBe('2')
    expect(a.due_date).toBe('2021-09-30T00:00:00.000Z')
  })

  it('maps contacts[0], opportunity, notes and closeDate', () => {
    const raw = {
      ...ACTIVITY_LIST.data[0]!,
      contacts: [{ id: 5 }],
      opportunity: { id: 9 },
      notes: 'Bring the contract',
      closeDate: '2021-10-01',
    }
    const a = ActivitySchema.parse(transformActivity(raw))
    expect(a.contact_id).toBe('5')
    expect(a.deal_id).toBe('9')
    expect(a.note).toBe('Bring the contract')
    expect(a.done).toBe(true)
  })

  it('does not pick an owner among several users', () => {
    const raw = { ...ACTIVITY_LIST.data[0]!, users: [{ id: 1 }, { id: 2 }] }
    expect(ActivitySchema.parse(transformActivity(raw)).owner_id).toBeUndefined()
  })

  it('parses every row of the sample', () => {
    for (const raw of ACTIVITY_LIST.data) ActivitySchema.parse(transformActivity(raw))
  })

  it('keeps regDate and modDate apart', () => {
    const raw = { ...ACTIVITY_LIST.data[0]!, modDate: '2021-10-02T09:00:00.000Z' }
    const a = ActivitySchema.parse(transformActivity(raw))
    expect(a.created_at).toBe('2021-09-29T06:40:28.000Z')
    expect(a.updated_at).toBe('2021-10-02T09:00:00.000Z')
  })

  it('untransforms back to platform shape', () => {
    const result = untransformActivity({ subject: 'Test', type: 'meeting' })
    expect(result.description).toBe('Test')
    expect((result.activityType as Record<string, unknown>).name).toBe('meeting')
  })
})
