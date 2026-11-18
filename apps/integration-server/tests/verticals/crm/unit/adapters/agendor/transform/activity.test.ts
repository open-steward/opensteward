import { describe, it, expect } from 'vitest'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'
import { transformActivity, untransformActivity, type RawAgendorActivity } from '../../../../../../../src/verticals/crm/adapters/agendor/transform/activity'

function makeRaw(overrides: Partial<RawAgendorActivity> = {}): RawAgendorActivity {
  return { id: 1, ...overrides }
}

describe('agendor transformActivity', () => {
  it('maps id', () => {
    const result = transformActivity(makeRaw())
    expect(result.id).toBe('1')
  })

  it('maps type', () => {
    const result = transformActivity(makeRaw({ type: 'call' }))
    expect(result.type).toBe('call')
  })

  it('maps subject from title', () => {
    const result = transformActivity(makeRaw({ title: 'Follow up' }))
    expect(result.subject).toBe('Follow up')
  })

  it('maps due_date', () => {
    const result = transformActivity(makeRaw({ due_date: '2024-01-01' }))
    expect(result.due_date).toBe('2024-01-01')
  })

  it('maps contact_id from person.id', () => {
    const result = transformActivity(makeRaw({ person: { id: 42 } }))
    expect(result.contact_id).toBe('42')
  })

  it('maps deal_id from deal.id', () => {
    const result = transformActivity(makeRaw({ deal: { id: 99 } }))
    expect(result.deal_id).toBe('99')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformActivity(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformActivity(raw).metadata).toBe(raw)
  })

  it('untransforms back to platform shape', () => {
    const result = untransformActivity({ subject: 'Test', type: 'call' })
    expect(result).toBeDefined()
    expect(result.title).toBe('Test')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformActivity(makeRaw())
    expect(() => ActivitySchema.parse(result)).not.toThrow()
  })
})
