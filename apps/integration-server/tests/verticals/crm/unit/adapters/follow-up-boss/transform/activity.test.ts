import { describe, it, expect } from 'vitest'
import {
  transformActivity,
  untransformActivity,
  type RawFollowUpBossTask,
} from '../../../../../../../src/verticals/crm/adapters/follow-up-boss/transform/activity'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'

function makeRaw(overrides: Partial<RawFollowUpBossTask> = {}): RawFollowUpBossTask {
  return { id: 1, ...overrides }
}

describe('follow-up-boss transformActivity', () => {
  it('maps id to string', () => {
    expect(transformActivity(makeRaw({ id: 99 })).id).toBe('99')
  })

  it('maps name to subject', () => {
    expect(transformActivity(makeRaw({ name: 'Follow up call' })).subject).toBe('Follow up call')
  })

  it('maps type field directly', () => {
    expect(transformActivity(makeRaw({ type: 'call' })).type).toBe('call')
  })

  it('maps note field', () => {
    expect(transformActivity(makeRaw({ note: 'Discussed Q1' })).note).toBe('Discussed Q1')
  })

  it('maps personId to contact_id string', () => {
    expect(transformActivity(makeRaw({ personId: 101 })).contact_id).toBe('101')
  })

  it('maps dealId to deal_id string', () => {
    expect(transformActivity(makeRaw({ dealId: 202 })).deal_id).toBe('202')
  })

  it('prefers assignedTo over assignedUserId for owner_id', () => {
    const result = transformActivity(
      makeRaw({ assignedTo: 'agent@example.com', assignedUserId: 5 }),
    )
    expect(result.owner_id).toBe('agent@example.com')
  })

  it('falls back to assignedUserId string when assignedTo absent', () => {
    expect(transformActivity(makeRaw({ assignedUserId: 5 })).owner_id).toBe('5')
  })

  it('maps dueDate directly as due_date', () => {
    expect(transformActivity(makeRaw({ dueDate: '2024-03-31T00:00:00.000Z' })).due_date).toBe(
      '2024-03-31T00:00:00.000Z',
    )
  })

  it('maps isCompleted to done', () => {
    expect(transformActivity(makeRaw({ isCompleted: true })).done).toBe(true)
    expect(transformActivity(makeRaw({ isCompleted: false })).done).toBe(false)
  })

  it('maps created/updated timestamps directly', () => {
    const result = transformActivity(
      makeRaw({ created: '2023-11-01T10:00:00.000Z', updated: '2023-11-14T22:00:00.000Z' }),
    )
    expect(result.created_at).toBe('2023-11-01T10:00:00.000Z')
    expect(result.updated_at).toBe('2023-11-14T22:00:00.000Z')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformActivity(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformActivity(raw).metadata).toBe(raw)
  })

  it('passes ActivitySchema validation with full input', () => {
    const raw: RawFollowUpBossTask = {
      id: 99,
      name: 'Follow up call',
      type: 'call',
      note: 'Discussed Q1',
      personId: 101,
      dealId: 202,
      assignedTo: 'agent@example.com',
      dueDate: '2024-03-31T00:00:00.000Z',
      isCompleted: false,
      created: '2023-11-01T10:00:00.000Z',
      updated: '2023-11-14T22:00:00.000Z',
    }
    const result = transformActivity(raw)
    expect(() => ActivitySchema.parse(result)).not.toThrow()
  })
})

describe('follow-up-boss untransformActivity', () => {
  it('maps subject back to name', () => {
    expect(untransformActivity({ subject: 'Call' }).name).toBe('Call')
  })

  it('maps type through directly', () => {
    expect(untransformActivity({ type: 'call' }).type).toBe('call')
  })

  it('maps contact_id back to personId', () => {
    expect(untransformActivity({ contact_id: '101' }).personId).toBe('101')
  })

  it('maps deal_id back to dealId', () => {
    expect(untransformActivity({ deal_id: '202' }).dealId).toBe('202')
  })

  it('maps due_date back to dueDate', () => {
    expect(untransformActivity({ due_date: '2024-03-31T00:00:00.000Z' }).dueDate).toBe(
      '2024-03-31T00:00:00.000Z',
    )
  })

  it('maps owner_id back to assignedTo', () => {
    expect(untransformActivity({ owner_id: 'agent@example.com' }).assignedTo).toBe(
      'agent@example.com',
    )
  })

  it('maps done back to isCompleted', () => {
    expect(untransformActivity({ done: true }).isCompleted).toBe(true)
  })

  it('omits unset fields', () => {
    const result = untransformActivity({})
    expect(result).not.toHaveProperty('name')
    expect(result).not.toHaveProperty('type')
  })
})
