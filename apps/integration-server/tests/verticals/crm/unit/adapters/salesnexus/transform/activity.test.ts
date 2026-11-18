import { describe, it, expect } from 'vitest'
import {
  transformActivity,
  untransformActivity,
  type RawSalesnexusActivity,
} from '../../../../../../../src/verticals/crm/adapters/salesnexus/transform/activity'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'

function makeRaw(overrides: Partial<RawSalesnexusActivity> = {}): RawSalesnexusActivity {
  return { 'activity-id': 'act-1', ...overrides }
}

describe('salesnexus transformActivity', () => {
  it('maps activity-id to id string', () => {
    expect(transformActivity(makeRaw()).id).toBe('act-1')
  })

  it('maps regarding to subject', () => {
    expect(transformActivity(makeRaw({ regarding: 'Discovery call' })).subject).toBe(
      'Discovery call',
    )
  })

  it('maps details to note', () => {
    expect(transformActivity(makeRaw({ details: 'Discussed scope' })).note).toBe('Discussed scope')
  })

  it('maps type', () => {
    expect(transformActivity(makeRaw({ type: 'call' })).type).toBe('call')
  })

  it('maps schedule-with to contact_id', () => {
    expect(transformActivity(makeRaw({ 'schedule-with': 'c-5' })).contact_id).toBe('c-5')
  })

  it('maps schedule-for to owner_id', () => {
    expect(transformActivity(makeRaw({ 'schedule-for': 'u-10' })).owner_id).toBe('u-10')
  })

  it('coerces start-time to ISO string for due_date', () => {
    const result = transformActivity(makeRaw({ 'start-time': '2025-06-01T09:00:00Z' }))
    expect(result.due_date).toBe('2025-06-01T09:00:00.000Z')
  })

  it('maps boolean completed to done', () => {
    expect(transformActivity(makeRaw({ completed: true })).done).toBe(true)
    expect(transformActivity(makeRaw({ completed: false })).done).toBe(false)
  })

  it('maps string "true"/"false" completed to boolean done', () => {
    expect(transformActivity(makeRaw({ completed: 'true' })).done).toBe(true)
    expect(transformActivity(makeRaw({ completed: 'false' })).done).toBe(false)
  })

  it('returns undefined done for unknown completed value', () => {
    expect(transformActivity(makeRaw({ completed: 'maybe' })).done).toBeUndefined()
  })

  it('preserves raw metadata', () => {
    const raw = makeRaw({ type: 'meeting' })
    expect(transformActivity(raw).metadata).toBe(raw)
  })

  it('produces schema-valid output', () => {
    const raw: RawSalesnexusActivity = {
      'activity-id': 'act-99',
      regarding: 'Follow-up',
      details: 'Check contract status',
      type: 'call',
      'schedule-with': 'c-3',
      'schedule-for': 'u-1',
      'start-time': '2025-09-01T14:00:00.000Z',
      completed: false,
    }
    expect(() => ActivitySchema.parse(transformActivity(raw))).not.toThrow()
  })
})

describe('salesnexus untransformActivity', () => {
  it('maps subject to regarding', () => {
    expect(untransformActivity({ subject: 'Call' })).toMatchObject({ regarding: 'Call' })
  })

  it('maps note to details', () => {
    expect(untransformActivity({ note: 'Notes here' })).toMatchObject({ details: 'Notes here' })
  })

  it('maps contact_id to schedule-with', () => {
    expect(untransformActivity({ contact_id: 'c-9' })).toMatchObject({ 'schedule-with': 'c-9' })
  })

  it('omits unset fields', () => {
    const result = untransformActivity({})
    expect(Object.keys(result)).toHaveLength(0)
  })
})
