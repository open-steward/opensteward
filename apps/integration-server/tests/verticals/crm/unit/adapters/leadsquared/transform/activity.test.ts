import { describe, it, expect } from 'vitest'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'
import { transformActivity, untransformActivity, type RawLeadsquaredActivity } from '../../../../../../../src/verticals/crm/adapters/leadsquared/transform/activity'

function makeRaw(overrides: Partial<RawLeadsquaredActivity> = {}): RawLeadsquaredActivity {
  return { ActivityId: '1', ...overrides }
}

describe('leadsquared transformActivity', () => {
  it('maps id from ActivityId', () => {
    const result = transformActivity(makeRaw())
    expect(result.id).toBe('1')
  })

  it('maps type from EventName', () => {
    const result = transformActivity(makeRaw({ EventName: 'Call' }))
    expect(result.type).toBe('Call')
  })

  it('maps subject from EventName', () => {
    const result = transformActivity(makeRaw({ EventName: 'Demo' }))
    expect(result.subject).toBe('Demo')
  })

  it('maps note from ActivityNote', () => {
    const result = transformActivity(makeRaw({ ActivityNote: 'Details' }))
    expect(result.note).toBe('Details')
  })

  it('maps contact_id from LeadId', () => {
    const result = transformActivity(makeRaw({ LeadId: 'L1' }))
    expect(result.contact_id).toBe('L1')
  })

  it('maps due_date from ActivityDate', () => {
    const result = transformActivity(makeRaw({ ActivityDate: '2024-06-01' }))
    expect(result.due_date).toBe('2024-06-01')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformActivity(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformActivity(raw).metadata).toBe(raw)
  })

  it('untransforms back to platform shape', () => {
    const result = untransformActivity({ subject: 'Test', note: 'Details' })
    expect(result).toBeDefined()
    expect(result.EventName).toBe('Test')
    expect(result.ActivityNote).toBe('Details')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformActivity(makeRaw())
    expect(() => ActivitySchema.parse(result)).not.toThrow()
  })
})
