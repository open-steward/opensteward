import { describe, it, expect } from 'vitest'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'
import { transformActivity, untransformActivity } from '../../../../../../../src/verticals/crm/adapters/ontraport/transform/activity'
import type { RawOntraportTask } from '../../../../../../../src/verticals/crm/adapters/ontraport/transform/activity'

function makeRaw(overrides: Partial<RawOntraportTask> = {}): RawOntraportTask {
  return { id: '1', ...overrides }
}

describe('ontraport transformActivity', () => {
  it('maps id', () => {
    expect(transformActivity(makeRaw()).id).toBe('1')
  })
  it('maps subject from message', () => {
    expect(transformActivity(makeRaw({ message: 'Call client' })).subject).toBe('Call client')
  })
  it('maps done when status is 1', () => {
    expect(transformActivity(makeRaw({ status: '1' })).done).toBe(true)
    expect(transformActivity(makeRaw({ status: '0' })).done).toBe(false)
  })
  it('maps contact_id', () => {
    expect(transformActivity(makeRaw({ contact_id: '42' })).contact_id).toBe('42')
  })
  it('handles null contact_id', () => {
    expect(transformActivity(makeRaw({ contact_id: null })).contact_id).toBeUndefined()
  })
  it('handles missing optional fields gracefully', () => {
    expect(() => transformActivity(makeRaw())).not.toThrow()
  })
  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformActivity(raw).metadata).toBe(raw)
  })
  it('untransforms back to platform shape', () => {
    const result = untransformActivity({ subject: 'Follow up', done: true })
    expect(result.message).toBe('Follow up')
    expect(result.status).toBe('1')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformActivity(makeRaw())
    expect(() => ActivitySchema.parse(result)).not.toThrow()
  })
})
