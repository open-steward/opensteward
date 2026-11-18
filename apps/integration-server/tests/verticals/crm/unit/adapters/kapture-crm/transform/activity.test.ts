import { describe, it, expect } from 'vitest'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'
import {
  transformActivity,
  untransformActivity,
  type RawKaptureActivity,
} from '../../../../../../../src/verticals/crm/adapters/kapture-crm/transform/activity'

function makeRaw(overrides: Partial<RawKaptureActivity> = {}): RawKaptureActivity {
  return { ...overrides }
}

describe('kapture-crm transformActivity', () => {
  it('maps id to string', () => {
    expect(transformActivity(makeRaw({ id: '9' })).id).toBe('9')
  })

  it('marks done from boolean true', () => {
    expect(transformActivity(makeRaw({ is_completed: true })).done).toBe(true)
  })

  it('marks done from numeric 1', () => {
    expect(transformActivity(makeRaw({ is_completed: 1 })).done).toBe(true)
  })

  it('marks not done when is_completed is false', () => {
    expect(transformActivity(makeRaw({ is_completed: false })).done).toBe(false)
  })

  it('maps subject and description', () => {
    const result = transformActivity(makeRaw({ subject: 'Call', description: 'Notes' }))
    expect(result.subject).toBe('Call')
    expect(result.note).toBe('Notes')
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

describe('kapture-crm untransformActivity', () => {
  it('maps subject', () => {
    const result = untransformActivity({ subject: 'Meeting' })
    expect(result.subject).toBe('Meeting')
  })
})
