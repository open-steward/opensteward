import { describe, it, expect } from 'vitest'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'
import {
  transformActivity,
  untransformActivity,
  type RawRexAppointment,
} from '../../../../../../../src/verticals/crm/adapters/rex-crm/transform/activity'

function makeRaw(overrides: Partial<RawRexAppointment> = {}): RawRexAppointment {
  return { id: 1, ...overrides }
}

describe('rex-crm transformActivity', () => {
  it('maps id to string', () => {
    expect(transformActivity(makeRaw({ id: 5 })).id).toBe('5')
  })

  it('maps type from appt_type', () => {
    expect(transformActivity(makeRaw({ appt_type: 'inspection' })).type).toBe('inspection')
  })

  it('maps deal_id from listing_id', () => {
    expect(transformActivity(makeRaw({ listing_id: 20 })).deal_id).toBe('20')
  })

  it('maps due_date from due_time', () => {
    expect(transformActivity(makeRaw({ due_time: '2025-06-01T10:00:00Z' })).due_date).toBe('2025-06-01T10:00:00Z')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformActivity(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformActivity(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformActivity(makeRaw({ id: 5 }))
    expect(() => ActivitySchema.parse(result)).not.toThrow()
  })
})

describe('rex-crm untransformActivity', () => {
  it('maps type to appt_type', () => {
    const result = untransformActivity({ type: 'open-home' })
    expect(result.appt_type).toBe('open-home')
  })
})
