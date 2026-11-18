import { describe, it, expect } from 'vitest'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'
import { transformActivity, untransformActivity } from '../../../../../../../src/verticals/crm/adapters/sellsy/transform/activity'
import type { RawSellsyActivity } from '../../../../../../../src/verticals/crm/adapters/sellsy/transform/activity'

function makeRaw(overrides: Partial<RawSellsyActivity> = {}): RawSellsyActivity {
  return { id: 1, ...overrides }
}

describe('sellsy transformActivity', () => {
  it('maps id', () => {
    expect(transformActivity(makeRaw()).id).toBe('1')
  })
  it('maps subject from name', () => {
    expect(transformActivity(makeRaw({ name: 'Call client' })).subject).toBe('Call client')
  })
  it('maps note from description', () => {
    expect(transformActivity(makeRaw({ description: 'Details here' })).note).toBe('Details here')
  })
  it('maps done from is_done', () => {
    expect(transformActivity(makeRaw({ is_done: true })).done).toBe(true)
  })
  it('maps owner_id', () => {
    expect(transformActivity(makeRaw({ owner_id: '5' })).owner_id).toBe('5')
  })
  it('handles null owner_id', () => {
    expect(transformActivity(makeRaw({ owner_id: null })).owner_id).toBeUndefined()
  })
  it('always sets type to task', () => {
    expect(transformActivity(makeRaw()).type).toBe('task')
  })
  it('handles missing optional fields gracefully', () => {
    expect(() => transformActivity(makeRaw())).not.toThrow()
  })
  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformActivity(raw).metadata).toBe(raw)
  })
  it('untransforms back to platform shape', () => {
    const result = untransformActivity({ subject: 'Call', done: true })
    expect(result.name).toBe('Call')
    expect(result.is_done).toBe(true)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformActivity(makeRaw())
    expect(() => ActivitySchema.parse(result)).not.toThrow()
  })
})
