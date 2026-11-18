import { describe, it, expect } from 'vitest'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'
import {
  transformActivity,
  untransformActivity,
  type RawHubSpotTask,
} from '../../../../../../../src/verticals/crm/adapters/hubspot/transform/activity'

function makeRaw(overrides: Partial<RawHubSpotTask> = {}): RawHubSpotTask {
  return { id: 'hs-t-1', properties: {}, ...overrides }
}

describe('hubspot transformActivity', () => {
  it('maps id', () => {
    expect(transformActivity(makeRaw({ id: 'hs-t-1' })).id).toBe('hs-t-1')
  })

  it('sets type to task', () => {
    expect(transformActivity(makeRaw()).type).toBe('task')
  })

  it('maps hs_task_subject to subject', () => {
    const result = transformActivity(makeRaw({ properties: { hs_task_subject: 'Follow up' } }))
    expect(result.subject).toBe('Follow up')
  })

  it('marks done when status is COMPLETED', () => {
    const result = transformActivity(makeRaw({ properties: { hs_task_status: 'COMPLETED' } }))
    expect(result.done).toBe(true)
  })

  it('marks not done for other statuses', () => {
    const result = transformActivity(makeRaw({ properties: { hs_task_status: 'NOT_STARTED' } }))
    expect(result.done).toBe(false)
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformActivity(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformActivity(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformActivity(makeRaw({ id: 'hs-t-1' }))
    expect(() => ActivitySchema.parse(result)).not.toThrow()
  })
})

describe('hubspot untransformActivity', () => {
  it('sets status COMPLETED when done is true', () => {
    const result = untransformActivity({ done: true })
    const props = result.properties as Record<string, unknown>
    expect(props.hs_task_status).toBe('COMPLETED')
  })
})
