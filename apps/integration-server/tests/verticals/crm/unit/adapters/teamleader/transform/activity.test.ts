import { describe, it, expect } from 'vitest'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'
import { transformActivity, untransformActivity } from '../../../../../../../src/verticals/crm/adapters/teamleader/transform/activity'
import type { RawTeamleaderActivity } from '../../../../../../../src/verticals/crm/adapters/teamleader/transform/activity'

function makeRaw(overrides: Partial<RawTeamleaderActivity> = {}): RawTeamleaderActivity {
  return { id: 'a1', ...overrides }
}

describe('teamleader transformActivity', () => {
  it('maps id', () => {
    expect(transformActivity(makeRaw()).id).toBe('a1')
  })
  it('maps subject', () => {
    expect(transformActivity(makeRaw({ subject: 'Follow up' })).subject).toBe('Follow up')
  })
  it('maps note from description', () => {
    expect(transformActivity(makeRaw({ description: 'Details' })).note).toBe('Details')
  })
  it('maps done', () => {
    expect(transformActivity(makeRaw({ done: true })).done).toBe(true)
  })
  it('maps due_date from ends_on, falls back to starts_on', () => {
    expect(transformActivity(makeRaw({ ends_on: '2024-01-15' })).due_date).toBe('2024-01-15')
    expect(transformActivity(makeRaw({ starts_on: '2024-01-10' })).due_date).toBe('2024-01-10')
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
    expect(result.subject).toBe('Call')
    expect(result.done).toBe(true)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformActivity(makeRaw())
    expect(() => ActivitySchema.parse(result)).not.toThrow()
  })
})
