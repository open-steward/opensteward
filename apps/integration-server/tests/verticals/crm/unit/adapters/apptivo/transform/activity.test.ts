import { describe, it, expect } from 'vitest'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'
import { transformActivity, untransformActivity, type RawApptivoActivity } from '../../../../../../../src/verticals/crm/adapters/apptivo/transform/activity'

function makeRaw(overrides: Partial<RawApptivoActivity> = {}): RawApptivoActivity {
  return { activityId: '1', ...overrides }
}

describe('apptivo transformActivity', () => {
  it('maps id from activityId', () => {
    const result = transformActivity(makeRaw())
    expect(result.id).toBe('1')
  })

  it('maps type from activityType', () => {
    const result = transformActivity(makeRaw({ activityType: 'call' }))
    expect(result.type).toBe('call')
  })

  it('maps subject', () => {
    const result = transformActivity(makeRaw({ subject: 'Follow up' }))
    expect(result.subject).toBe('Follow up')
  })

  it('maps note from description', () => {
    const result = transformActivity(makeRaw({ description: 'Details' }))
    expect(result.note).toBe('Details')
  })

  it('maps done when status is completed', () => {
    const result = transformActivity(makeRaw({ status: 'completed' }))
    expect(result.done).toBe(true)
  })

  it('maps company_id from customerId', () => {
    const result = transformActivity(makeRaw({ customerId: 'c1' }))
    expect(result.company_id).toBe('c1')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformActivity(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformActivity(raw).metadata).toBe(raw)
  })

  it('untransforms back to platform shape', () => {
    const result = untransformActivity({ subject: 'Test', type: 'email' })
    expect(result).toBeDefined()
    expect(result.subject).toBe('Test')
    expect(result.activityType).toBe('email')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformActivity(makeRaw())
    expect(() => ActivitySchema.parse(result)).not.toThrow()
  })
})
