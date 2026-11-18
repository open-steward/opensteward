import { describe, it, expect } from 'vitest'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'
import { transformActivity, untransformActivity, type RawDynamicsTask } from '../../../../../../../src/verticals/crm/adapters/dynamics365-crm/transform/activity'

function makeRaw(overrides: Partial<RawDynamicsTask> = {}): RawDynamicsTask {
  return { activityid: 'act1', ...overrides }
}

describe('dynamics365-crm transformActivity', () => {
  it('maps activityid to id', () => {
    expect(transformActivity(makeRaw()).id).toBe('act1')
  })

  it('maps subject', () => {
    expect(transformActivity(makeRaw({ subject: 'Call' })).subject).toBe('Call')
  })

  it('maps done from statecode 1', () => {
    expect(transformActivity(makeRaw({ statecode: 1 })).done).toBe(true)
    expect(transformActivity(makeRaw({ statecode: 0 })).done).toBe(false)
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformActivity(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformActivity(raw).metadata).toBe(raw)
  })

  it('untransformActivity maps subject and statecode', () => {
    const result = untransformActivity({ subject: 'Demo', done: true })
    expect(result.subject).toBe('Demo')
    expect(result.statecode).toBe(1)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformActivity(makeRaw())
    expect(() => ActivitySchema.parse(result)).not.toThrow()
  })
})
