import { describe, it, expect } from 'vitest'
import {
  transformActivity,
  untransformActivity,
  type RawSapActivity,
} from '../../../../../../../src/verticals/crm/adapters/sap-sales-cloud/transform/activity'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'

function makeRaw(overrides: Partial<RawSapActivity> = {}): RawSapActivity {
  return { id: 'task-001', ...overrides }
}

describe('sap-sales-cloud transformActivity', () => {
  it('maps id to string', () => {
    expect(transformActivity(makeRaw({ id: 'task-42' })).id).toBe('task-42')
  })

  it('maps subject', () => {
    expect(transformActivity(makeRaw({ subject: 'Prepare proposal' })).subject).toBe(
      'Prepare proposal',
    )
  })

  it('maps note', () => {
    expect(transformActivity(makeRaw({ note: 'Include pricing' })).note).toBe('Include pricing')
  })

  it('maps categoryCode PHONE_CALL → call', () => {
    expect(transformActivity(makeRaw({ categoryCode: 'PHONE_CALL' })).type).toBe('call')
  })

  it('maps categoryCode EMAIL → email', () => {
    expect(transformActivity(makeRaw({ categoryCode: 'EMAIL' })).type).toBe('email')
  })

  it('maps categoryCode APPOINTMENT → meeting', () => {
    expect(transformActivity(makeRaw({ categoryCode: 'APPOINTMENT' })).type).toBe('meeting')
  })

  it('maps categoryCode TASK → task', () => {
    expect(transformActivity(makeRaw({ categoryCode: 'TASK' })).type).toBe('task')
  })

  it('defaults type to "task" when categoryCode absent', () => {
    expect(transformActivity(makeRaw()).type).toBe('task')
  })

  it('maps contactId to contact_id', () => {
    expect(transformActivity(makeRaw({ contactId: 'cont-3' })).contact_id).toBe('cont-3')
  })

  it('maps accountId to company_id', () => {
    expect(transformActivity(makeRaw({ accountId: 'acc-2' })).company_id).toBe('acc-2')
  })

  it('maps opportunityId to deal_id', () => {
    expect(transformActivity(makeRaw({ opportunityId: 'opp-7' })).deal_id).toBe('opp-7')
  })

  it('maps ownerId to owner_id', () => {
    expect(transformActivity(makeRaw({ ownerId: 'usr-5' })).owner_id).toBe('usr-5')
  })

  it('maps statusCode "3" → done=true, others → done=false', () => {
    expect(transformActivity(makeRaw({ statusCode: '3' })).done).toBe(true)
    expect(transformActivity(makeRaw({ statusCode: '1' })).done).toBe(false)
    expect(transformActivity(makeRaw({ statusCode: '2' })).done).toBe(false)
  })

  it('maps numeric durationMinutes', () => {
    expect(transformActivity(makeRaw({ durationMinutes: 45 })).duration_minutes).toBe(45)
  })

  it('maps string durationMinutes to integer', () => {
    expect(transformActivity(makeRaw({ durationMinutes: '30' })).duration_minutes).toBe(30)
  })

  it('coerces dueDate through toIsoDatetime', () => {
    const result = transformActivity(makeRaw({ dueDate: '2025-07-01T09:00:00.000Z' }))
    expect(result.due_date).toBe('2025-07-01T09:00:00.000Z')
  })

  it('preserves raw metadata', () => {
    const raw = makeRaw({ subject: 'Task' })
    expect(transformActivity(raw).metadata).toBe(raw)
  })

  it('produces schema-valid output', () => {
    const raw: RawSapActivity = {
      id: 'task-99',
      subject: 'Send proposal',
      categoryCode: 'TASK',
      note: 'Attach latest deck',
      dueDate: '2025-08-15T17:00:00.000Z',
      statusCode: '1',
      accountId: 'acc-1',
      contactId: 'cont-1',
      opportunityId: 'opp-1',
      ownerId: 'usr-1',
      durationMinutes: 60,
      createdAt: '2024-01-01T00:00:00.000Z',
      lastModifiedAt: '2024-06-01T00:00:00.000Z',
    }
    expect(() => ActivitySchema.parse(transformActivity(raw))).not.toThrow()
  })
})

describe('sap-sales-cloud untransformActivity', () => {
  it('maps subject', () => {
    expect(untransformActivity({ subject: 'Review contract' })).toMatchObject({
      subject: 'Review contract',
    })
  })

  it('maps done=true → statusCode "3", done=false → "1"', () => {
    expect(untransformActivity({ done: true })).toMatchObject({ statusCode: '3' })
    expect(untransformActivity({ done: false })).toMatchObject({ statusCode: '1' })
  })

  it('maps company_id to accountId', () => {
    expect(untransformActivity({ company_id: 'acc-9' })).toMatchObject({ accountId: 'acc-9' })
  })

  it('omits unset fields', () => {
    expect(Object.keys(untransformActivity({}))).toHaveLength(0)
  })
})
