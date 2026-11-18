import { describe, it, expect } from 'vitest'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'
import {
  transformActivity,
  untransformActivity,
  type RawRecruitCrmActivity,
} from '../../../../../../../src/verticals/crm/adapters/recruit-crm/transform/activity'

function makeRaw(overrides: Partial<RawRecruitCrmActivity> = {}): RawRecruitCrmActivity {
  return { id: '1', ...overrides }
}

describe('recruit-crm transformActivity', () => {
  it('maps id to string', () => {
    expect(transformActivity(makeRaw({ id: '9' })).id).toBe('9')
  })

  it('maps subject and note from description', () => {
    const result = transformActivity(makeRaw({ subject: 'Call', description: 'Details' }))
    expect(result.subject).toBe('Call')
    expect(result.note).toBe('Details')
  })

  it('maps done from is_completed', () => {
    expect(transformActivity(makeRaw({ is_completed: true })).done).toBe(true)
    expect(transformActivity(makeRaw({ is_completed: 1 })).done).toBe(true)
    expect(transformActivity(makeRaw({ is_completed: false })).done).toBe(false)
  })

  it('maps owner_id from owner object', () => {
    const result = transformActivity(makeRaw({ owner: { id: '7' } }))
    expect(result.owner_id).toBe('7')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformActivity(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformActivity(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformActivity(makeRaw({ id: '9' }))
    expect(() => ActivitySchema.parse(result)).not.toThrow()
  })
})

describe('recruit-crm untransformActivity', () => {
  it('maps note to description', () => {
    const result = untransformActivity({ note: 'Details' })
    expect(result.description).toBe('Details')
  })
})
