import { describe, it, expect } from 'vitest'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'
import { transformActivity, untransformActivity, type RawSugarTask } from '../../../../../../../src/verticals/crm/adapters/sugarcrm/transform/activity'

function makeRaw(overrides: Partial<RawSugarTask> = {}): RawSugarTask {
  return { id: 'STASK1', ...overrides }
}

describe('sugarcrm transformActivity', () => {
  it('maps id', () => {
    expect(transformActivity(makeRaw()).id).toBe('STASK1')
  })

  it('type is always "task"', () => {
    expect(transformActivity(makeRaw()).type).toBe('task')
  })

  it('marks done when status is Completed', () => {
    expect(transformActivity(makeRaw({ status: 'Completed' })).done).toBe(true)
    expect(transformActivity(makeRaw({ status: 'Deferred' })).done).toBe(false)
  })

  it('maps name to subject', () => {
    expect(transformActivity(makeRaw({ name: 'Review contract' })).subject).toBe('Review contract')
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

describe('sugarcrm untransformActivity', () => {
  it('maps subject to name', () => {
    expect(untransformActivity({ subject: 'Call' }).name).toBe('Call')
  })

  it('maps done to status string', () => {
    expect(untransformActivity({ done: true }).status).toBe('Completed')
    expect(untransformActivity({ done: false }).status).toBe('Not Started')
  })
})
