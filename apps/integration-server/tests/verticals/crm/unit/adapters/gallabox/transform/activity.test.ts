import { describe, it, expect } from 'vitest'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'
import {
  transformActivity,
  type RawGallaboxActivity,
} from '../../../../../../../src/verticals/crm/adapters/gallabox/transform/activity'

function makeRaw(overrides: Partial<RawGallaboxActivity> = {}): RawGallaboxActivity {
  return { id: 'a-1', ...overrides }
}

describe('gallabox transformActivity', () => {
  it('maps string id to string', () => {
    expect(transformActivity(makeRaw({ id: 'a-99' })).id).toBe('a-99')
  })

  it('maps numeric id to string', () => {
    expect(transformActivity(makeRaw({ id: 42 })).id).toBe('42')
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformActivity(raw).metadata).toBe(raw)
  })

  it('does not throw on minimal input', () => {
    expect(() => transformActivity(makeRaw())).not.toThrow()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformActivity(makeRaw({ id: 'a-99' }))
    expect(() => ActivitySchema.parse(result)).not.toThrow()
  })
})
