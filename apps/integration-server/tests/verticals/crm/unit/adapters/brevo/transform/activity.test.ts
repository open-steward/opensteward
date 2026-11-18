import { describe, it, expect } from 'vitest'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'
import { transformActivity, untransformActivity, type RawBrevoActivity } from '../../../../../../../src/verticals/crm/adapters/brevo/transform/activity'

// Fixture shaped from the vendor spec's Task schema: type is `taskTypeId`,
// and contact/company/deal links are top-level arrays (`contactsIds`,
// `companiesIds`, `dealsIds`), not the singular `contact_id` / `company_id` /
// `deal_id` the adapter previously read.
function makeRaw(overrides: Partial<RawBrevoActivity> = {}): RawBrevoActivity {
  return {
    id: '63104e51ad2b9e4bcb970c37',
    taskTypeId: 'task_type_call',
    name: 'Discovery call',
    notes: 'Follow up on Q1 expansion',
    contactsIds: [12],
    companiesIds: ['61f4b45d90124f66d70c33d0'],
    dealsIds: ['63102c2fdfd15f658862dc76'],
    assignToId: '6329d10b0b78ba3212e8bb26',
    date: '2026-02-01T14:20:00.000+01:00',
    ...overrides,
  }
}

describe('brevo transformActivity', () => {
  it('maps id', () => {
    const result = transformActivity(makeRaw())
    expect(result.id).toBe('63104e51ad2b9e4bcb970c37')
  })

  it('maps type from taskTypeId', () => {
    const result = transformActivity(makeRaw())
    expect(result.type).toBe('task_type_call')
  })

  it('maps subject from name', () => {
    const result = transformActivity(makeRaw({ name: 'Demo call' }))
    expect(result.subject).toBe('Demo call')
  })

  it('maps note from notes', () => {
    const result = transformActivity(makeRaw({ notes: 'Important' }))
    expect(result.note).toBe('Important')
  })

  it('maps contact_id from the first element of contactsIds, stringified', () => {
    const result = transformActivity(makeRaw({ contactsIds: [12, 99] }))
    expect(result.contact_id).toBe('12')
  })

  it('maps company_id from the first element of companiesIds', () => {
    const result = transformActivity(makeRaw())
    expect(result.company_id).toBe('61f4b45d90124f66d70c33d0')
  })

  it('maps deal_id from the first element of dealsIds', () => {
    const result = transformActivity(makeRaw())
    expect(result.deal_id).toBe('63102c2fdfd15f658862dc76')
  })

  it('maps owner_id from assignToId', () => {
    const result = transformActivity(makeRaw())
    expect(result.owner_id).toBe('6329d10b0b78ba3212e8bb26')
  })

  it('does not read the old singular type/contact_id/company_id/deal_id/owner_id fields', () => {
    const result = transformActivity({
      id: '1',
      type: 'wrong',
      contact_id: 'wrong',
      company_id: 'wrong',
      deal_id: 'wrong',
      owner_id: 'wrong',
    } as unknown as RawBrevoActivity)
    expect(result.type).toBeUndefined()
    expect(result.contact_id).toBeUndefined()
    expect(result.company_id).toBeUndefined()
    expect(result.deal_id).toBeUndefined()
    expect(result.owner_id).toBeUndefined()
  })

  it('maps due_date from date', () => {
    const result = transformActivity(makeRaw({ date: '2026-06-01' }))
    expect(result.due_date).toBe('2026-06-01')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformActivity({ id: '1' })).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformActivity(raw).metadata).toBe(raw)
  })

  it('untransforms back to the platform shape', () => {
    const result = untransformActivity({
      subject: 'Test',
      type: 'task_type_call',
      contact_id: '12',
      company_id: 'co_1',
      deal_id: 'deal_1',
      owner_id: 'usr_1',
    })
    expect(result.name).toBe('Test')
    expect(result.taskTypeId).toBe('task_type_call')
    expect(result.contactsIds).toEqual([12])
    expect(result.companiesIds).toEqual(['co_1'])
    expect(result.dealsIds).toEqual(['deal_1'])
    expect(result.assignToId).toBe('usr_1')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformActivity(makeRaw())
    expect(() => ActivitySchema.parse(result)).not.toThrow()
  })
})
