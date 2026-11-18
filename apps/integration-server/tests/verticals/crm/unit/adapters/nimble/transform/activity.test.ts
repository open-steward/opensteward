import { describe, it, expect } from 'vitest'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'
import {
  transformActivity,
  type RawNimbleActivity,
} from '../../../../../../../src/verticals/crm/adapters/nimble/transform/activity'

function makeRaw(overrides: Partial<RawNimbleActivity> = {}): RawNimbleActivity {
  return { id: 'a-1', ...overrides }
}

describe('nimble transformActivity', () => {
  it('maps id to string', () => {
    expect(transformActivity(makeRaw({ id: 'a-1' })).id).toBe('a-1')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformActivity(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformActivity(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformActivity(makeRaw({ id: 'a-1' }))
    expect(() => ActivitySchema.parse(result)).not.toThrow()
  })
})
