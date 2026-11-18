import { describe, it, expect } from 'vitest'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'
import { transformActivity, untransformActivity, type RawCreatioActivity } from '../../../../../../../src/verticals/crm/adapters/creatio/transform/activity'

function makeRaw(overrides: Partial<RawCreatioActivity> = {}): RawCreatioActivity {
  return { Id: 'a1', ...overrides }
}

describe('creatio transformActivity', () => {
  it('maps Id to id string', () => {
    expect(transformActivity(makeRaw()).id).toBe('a1')
  })

  it('maps subject from Title', () => {
    expect(transformActivity(makeRaw({ Title: 'Call' })).subject).toBe('Call')
  })

  it('maps note from Notes', () => {
    expect(transformActivity(makeRaw({ Notes: 'details' })).note).toBe('details')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformActivity(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformActivity(raw).metadata).toBe(raw)
  })

  it('untransformActivity maps Title', () => {
    expect(untransformActivity({ subject: 'Demo' }).Title).toBe('Demo')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformActivity(makeRaw())
    expect(() => ActivitySchema.parse(result)).not.toThrow()
  })
})
