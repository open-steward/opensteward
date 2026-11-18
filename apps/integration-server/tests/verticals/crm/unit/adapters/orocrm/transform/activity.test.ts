import { describe, it, expect } from 'vitest'
import {
  transformActivity,
  untransformActivity,
} from '../../../../../../../src/verticals/crm/adapters/orocrm/transform/activity'
import type { JsonApiRecord } from '../../../../../../../src/verticals/crm/adapters/orocrm/client'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'

function makeRecord(
  attrs: Record<string, unknown> = {},
  rels: JsonApiRecord['relationships'] = {},
): JsonApiRecord {
  return {
    type: 'tasks',
    id: 'task_1',
    attributes: {
      subject: 'Follow-up call',
      description: 'Check in on Q1 deal',
      status: 'open',
      dueDate: '2026-03-01T09:00:00.000Z',
      createdAt: '2026-01-15T09:30:00.000Z',
      updatedAt: '2026-02-01T14:20:00.000Z',
      ...attrs,
    },
    relationships: {
      owner: { data: { type: 'users', id: 'usr_5' } },
      ...rels,
    },
  }
}

describe('orocrm transformActivity', () => {
  it('maps record.id to string id', () => {
    expect(transformActivity(makeRecord()).id).toBe('task_1')
  })

  it('always sets type to "task"', () => {
    expect(transformActivity(makeRecord()).type).toBe('task')
  })

  it('maps subject attribute to subject', () => {
    expect(transformActivity(makeRecord()).subject).toBe('Follow-up call')
  })

  it('maps description attribute to note', () => {
    expect(transformActivity(makeRecord()).note).toBe('Check in on Q1 deal')
  })

  it('maps status "open" to done=false', () => {
    expect(transformActivity(makeRecord({ status: 'open' })).done).toBe(false)
  })

  it('maps status "closed" to done=true', () => {
    expect(transformActivity(makeRecord({ status: 'closed' })).done).toBe(true)
  })

  it('maps owner relationship to owner_id', () => {
    expect(transformActivity(makeRecord()).owner_id).toBe('usr_5')
  })

  it('maps dueDate to due_date', () => {
    expect(transformActivity(makeRecord()).due_date).toBe('2026-03-01T09:00:00.000Z')
  })

  it('maps createdAt / updatedAt', () => {
    const result = transformActivity(makeRecord())
    expect(result.created_at).toBe('2026-01-15T09:30:00.000Z')
    expect(result.updated_at).toBe('2026-02-01T14:20:00.000Z')
  })

  it('passes ActivitySchema validation', () => {
    expect(() => ActivitySchema.parse(transformActivity(makeRecord()))).not.toThrow()
  })

  it('untransformActivity wraps in JSON:API envelope', () => {
    const out = untransformActivity({ subject: 'New task', done: true, note: 'Details' })
    expect((out['data'] as Record<string, unknown>)['type']).toBe('tasks')
    const attrs = (out['data'] as Record<string, Record<string, unknown>>)['attributes']
    expect(attrs['subject']).toBe('New task')
    expect(attrs['status']).toBe('closed')
    expect(attrs['description']).toBe('Details')
  })
})
