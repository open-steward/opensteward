import { describe, it, expect } from 'vitest'
import {
  transformActivity,
  untransformActivity,
  type RawMazricaAction,
} from '../../../../../../../src/verticals/crm/adapters/mazrica/transform/activity'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'

function makeRaw(overrides: Partial<RawMazricaAction> = {}): RawMazricaAction {
  return { id: 1, ...overrides }
}

describe('mazrica transformActivity', () => {
  it('maps id to string', () => {
    expect(transformActivity(makeRaw({ id: 99 })).id).toBe('99')
  })

  it('maps type.name to type', () => {
    const result = transformActivity(makeRaw({ type: { id: 1, name: 'visit' } }))
    expect(result.type).toBe('visit')
  })

  it('maps subject', () => {
    expect(transformActivity(makeRaw({ subject: 'Client visit' })).subject).toBe('Client visit')
  })

  it('maps memo to note', () => {
    expect(transformActivity(makeRaw({ memo: 'Discussed contract' })).note).toBe(
      'Discussed contract',
    )
  })

  it('maps customerId to company_id as string', () => {
    expect(transformActivity(makeRaw({ customerId: 30 })).company_id).toBe('30')
  })

  it('maps dealId to deal_id as string', () => {
    expect(transformActivity(makeRaw({ dealId: 8 })).deal_id).toBe('8')
  })

  it('maps userId to owner_id as string', () => {
    expect(transformActivity(makeRaw({ userId: 5 })).owner_id).toBe('5')
  })

  it('maps scheduledAt to due_date', () => {
    const result = transformActivity(makeRaw({ scheduledAt: '2024-07-15T09:00:00.000Z' }))
    expect(result.due_date).toBe('2024-07-15T09:00:00.000Z')
  })

  it('sets done = true when doneAt is set', () => {
    expect(transformActivity(makeRaw({ doneAt: '2024-07-16T10:00:00.000Z' })).done).toBe(true)
  })

  it('sets done = false when doneAt is absent', () => {
    expect(transformActivity(makeRaw()).done).toBe(false)
  })

  it('maps createdAt to IsoDatetime', () => {
    const result = transformActivity(makeRaw({ createdAt: '2024-01-01T00:00:00.000Z' }))
    expect(result.created_at).toBe('2024-01-01T00:00:00.000Z')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformActivity(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformActivity(raw).metadata).toBe(raw)
  })

  it('passes ActivitySchema validation', () => {
    const raw: RawMazricaAction = {
      id: 1,
      type: { id: 2, name: 'call' },
      subject: 'Follow up call',
      memo: 'Discussed renewal',
      customerId: 30,
      dealId: 8,
      userId: 5,
      scheduledAt: '2024-07-15T09:00:00.000Z',
      doneAt: '2024-07-15T10:00:00.000Z',
      createdAt: '2024-07-14T08:00:00.000Z',
      updatedAt: '2024-07-15T10:05:00.000Z',
    }
    const result = transformActivity(raw)
    expect(() => ActivitySchema.parse(result)).not.toThrow()
  })
})

describe('mazrica untransformActivity', () => {
  it('maps subject', () => {
    expect(untransformActivity({ subject: 'Product demo' }).subject).toBe('Product demo')
  })

  it('maps note to memo', () => {
    expect(untransformActivity({ note: 'Agreed on pricing' }).memo).toBe('Agreed on pricing')
  })

  it('maps due_date to scheduledAt', () => {
    expect(untransformActivity({ due_date: '2024-09-01T10:00:00.000Z' }).scheduledAt).toBe(
      '2024-09-01T10:00:00.000Z',
    )
  })

  it('maps owner_id to numeric userId', () => {
    expect(untransformActivity({ owner_id: '5' }).userId).toBe(5)
  })
})
