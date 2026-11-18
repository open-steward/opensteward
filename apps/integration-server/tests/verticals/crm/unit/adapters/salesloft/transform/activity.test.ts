import { describe, it, expect } from 'vitest'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'
import { transformActivity, untransformActivity, type RawSalesloftActivity } from '../../../../../../../src/verticals/crm/adapters/salesloft/transform/activity'

function makeRaw(overrides: Partial<RawSalesloftActivity> = {}): RawSalesloftActivity {
  return { id: 3, ...overrides }
}

describe('salesloft transformActivity', () => {
  it('maps id to string', () => {
    expect(transformActivity(makeRaw()).id).toBe('3')
  })

  it('maps person_id to contact_id string', () => {
    expect(transformActivity(makeRaw({ person_id: 99 })).contact_id).toBe('99')
  })

  it('maps description to note', () => {
    expect(transformActivity(makeRaw({ description: 'Call notes' })).note).toBe('Call notes')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformActivity(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformActivity(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformActivity(makeRaw())
    expect(() => ActivitySchema.parse(result)).not.toThrow()
  })
})

describe('salesloft untransformActivity', () => {
  it('maps contact_id to numeric person_id', () => {
    expect(untransformActivity({ contact_id: '10' }).person_id).toBe(10)
  })
})
