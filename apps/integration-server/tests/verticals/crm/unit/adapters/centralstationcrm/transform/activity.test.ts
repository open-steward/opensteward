import { describe, it, expect } from 'vitest'
import {
  transformActivity,
  untransformActivity,
  type RawCentralStationTask,
} from '../../../../../../../src/verticals/crm/adapters/centralstationcrm/transform/activity'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'

function makeRaw(overrides: Partial<RawCentralStationTask> = {}): RawCentralStationTask {
  return { id: 1, ...overrides }
}

describe('centralstationcrm transformActivity', () => {
  it('maps id to string', () => {
    expect(transformActivity(makeRaw({ id: 42 })).id).toBe('42')
  })

  it('maps badge to type', () => {
    expect(transformActivity(makeRaw({ badge: 'call' })).type).toBe('call')
  })

  it('maps name to subject', () => {
    expect(transformActivity(makeRaw({ name: 'Follow-up call' })).subject).toBe('Follow-up call')
  })

  it('maps user_id to owner_id as string', () => {
    expect(transformActivity(makeRaw({ user_id: 7 })).owner_id).toBe('7')
  })

  it('maps precise_time to due_date', () => {
    const result = transformActivity(makeRaw({ precise_time: '2026-06-01T09:00:00.000Z' }))
    expect(result.due_date).toBe('2026-06-01T09:00:00.000Z')
  })

  it('sets done to true when done_at is set', () => {
    expect(transformActivity(makeRaw({ done_at: '2026-06-01T10:00:00Z' })).done).toBe(true)
  })

  it('sets done to false when done_at is null', () => {
    expect(transformActivity(makeRaw({ done_at: null })).done).toBe(false)
  })

  it('routes person attachable_type to contact_id', () => {
    const result = transformActivity(makeRaw({ attachable_type: 'Person', attachable_id: 55 }))
    expect(result.contact_id).toBe('55')
    expect(result.company_id).toBeUndefined()
    expect(result.deal_id).toBeUndefined()
  })

  it('routes Company attachable_type to company_id', () => {
    const result = transformActivity(makeRaw({ attachable_type: 'Company', attachable_id: 10 }))
    expect(result.company_id).toBe('10')
    expect(result.contact_id).toBeUndefined()
  })

  it('routes Deal attachable_type to deal_id', () => {
    const result = transformActivity(makeRaw({ attachable_type: 'Deal', attachable_id: 3 }))
    expect(result.deal_id).toBe('3')
    expect(result.contact_id).toBeUndefined()
  })

  it('routes Project attachable_type to deal_id', () => {
    const result = transformActivity(makeRaw({ attachable_type: 'project', attachable_id: 8 }))
    expect(result.deal_id).toBe('8')
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformActivity(raw).metadata).toBe(raw)
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformActivity(makeRaw())).not.toThrow()
  })

  it('produces output that passes ActivitySchema.parse', () => {
    const raw = makeRaw({
      badge: 'meeting',
      name: 'Kickoff',
      user_id: 5,
      attachable_type: 'Person',
      attachable_id: 20,
      precise_time: '2026-06-01T09:00:00.000Z',
      done_at: null,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-02-01T00:00:00.000Z',
    })
    expect(() => ActivitySchema.parse(transformActivity(raw))).not.toThrow()
  })
})

describe('centralstationcrm untransformActivity', () => {
  it('wraps output in task key', () => {
    const result = untransformActivity({})
    expect(result).toHaveProperty('task')
  })

  it('maps subject to task.name', () => {
    const result = untransformActivity({ subject: 'Standup' })
    expect((result.task as Record<string, unknown>).name).toBe('Standup')
  })

  it('maps type to task.badge', () => {
    const result = untransformActivity({ type: 'call' })
    expect((result.task as Record<string, unknown>).badge).toBe('call')
  })

  it('maps owner_id to task.user_id', () => {
    const result = untransformActivity({ owner_id: 'usr_3' })
    expect((result.task as Record<string, unknown>).user_id).toBe('usr_3')
  })

  it('maps contact_id to task.attachable with Person type', () => {
    const result = untransformActivity({ contact_id: 'con_1' })
    const task = result.task as Record<string, unknown>
    expect(task.attachable_id).toBe('con_1')
    expect(task.attachable_type).toBe('Person')
  })

  it('maps company_id to task.attachable with Company type when contact_id absent', () => {
    const result = untransformActivity({ company_id: 'co_2' })
    const task = result.task as Record<string, unknown>
    expect(task.attachable_id).toBe('co_2')
    expect(task.attachable_type).toBe('Company')
  })

  it('maps deal_id to task.attachable with Deal type when others absent', () => {
    const result = untransformActivity({ deal_id: 'deal_4' })
    const task = result.task as Record<string, unknown>
    expect(task.attachable_id).toBe('deal_4')
    expect(task.attachable_type).toBe('Deal')
  })
})
