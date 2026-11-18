import { describe, it, expect } from 'vitest'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'
import { transformActivity, type RawFolkActivity } from '../../../../../../../src/verticals/crm/adapters/folk/transform/activity'

function makeRaw(overrides: Partial<RawFolkActivity> = {}): RawFolkActivity {
  return { id: 'act1', ...overrides }
}

describe('folk transformActivity', () => {
  it('maps id', () => {
    expect(transformActivity(makeRaw()).id).toBe('act1')
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
