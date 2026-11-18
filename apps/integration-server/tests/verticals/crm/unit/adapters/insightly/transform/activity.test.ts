import { describe, it, expect } from 'vitest'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'
import {
  transformActivity,
  untransformActivity,
  type RawInsightlyActivity,
} from '../../../../../../../src/verticals/crm/adapters/insightly/transform/activity'

function makeRaw(overrides: Partial<RawInsightlyActivity> = {}): RawInsightlyActivity {
  return { TASK_ID: 1, ...overrides }
}

describe('insightly transformActivity', () => {
  it('maps TASK_ID to string id', () => {
    expect(transformActivity(makeRaw({ TASK_ID: 5 })).id).toBe('5')
  })

  it('marks done when STATUS is COMPLETED', () => {
    expect(transformActivity(makeRaw({ STATUS: 'COMPLETED' })).done).toBe(true)
  })

  it('marks not done for other statuses', () => {
    expect(transformActivity(makeRaw({ STATUS: 'PENDING' })).done).toBe(false)
  })

  it('maps CONTACT_ID', () => {
    expect(transformActivity(makeRaw({ CONTACT_ID: 9 })).contact_id).toBe('9')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformActivity(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformActivity(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformActivity(makeRaw({ TASK_ID: 5 }))
    expect(() => ActivitySchema.parse(result)).not.toThrow()
  })
})

describe('insightly untransformActivity', () => {
  it('maps done true to COMPLETED status', () => {
    const result = untransformActivity({ done: true })
    expect(result.STATUS).toBe('COMPLETED')
  })
})
