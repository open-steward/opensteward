import { describe, it, expect } from 'vitest'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'
import {
  transformActivity,
  untransformActivity,
  type RawClarifyTask,
} from '../../../../../../../src/verticals/crm/adapters/clarify/transform/activity'

function makeRaw(overrides: Partial<RawClarifyTask> = {}): RawClarifyTask {
  return { id: 't-1', attributes: {}, ...overrides }
}

describe('clarify transformActivity', () => {
  it('maps id to string', () => {
    expect(transformActivity(makeRaw({ id: 't-55' })).id).toBe('t-55')
  })

  it('maps title to subject', () => {
    const result = transformActivity(makeRaw({ attributes: { title: 'Follow up call' } }))
    expect(result.subject).toBe('Follow up call')
  })

  it('maps notes to note', () => {
    const result = transformActivity(makeRaw({ attributes: { notes: 'Call at noon' } }))
    expect(result.note).toBe('Call at noon')
  })

  it('defaults type to "task" when absent', () => {
    const result = transformActivity(makeRaw({ attributes: {} }))
    expect(result.type).toBe('task')
  })

  it('uses provided type attribute', () => {
    const result = transformActivity(makeRaw({ attributes: { type: 'call' } }))
    expect(result.type).toBe('call')
  })

  it('done is true when status is "completed"', () => {
    const result = transformActivity(makeRaw({ attributes: { status: 'completed' } }))
    expect(result.done).toBe(true)
  })

  it('done is true when status is "done"', () => {
    const result = transformActivity(makeRaw({ attributes: { status: 'done' } }))
    expect(result.done).toBe(true)
  })

  it('done is false when status is "pending"', () => {
    const result = transformActivity(makeRaw({ attributes: { status: 'pending' } }))
    expect(result.done).toBe(false)
  })

  it('done is false when status is absent', () => {
    const result = transformActivity(makeRaw({ attributes: {} }))
    expect(result.done).toBe(false)
  })

  it('maps contact_id, company_id, deal_id, owner_id', () => {
    const result = transformActivity(
      makeRaw({
        attributes: {
          contact_id: 'c-1',
          company_id: 'co-2',
          deal_id: 'd-3',
          owner_id: 'u-4',
        },
      }),
    )
    expect(result.contact_id).toBe('c-1')
    expect(result.company_id).toBe('co-2')
    expect(result.deal_id).toBe('d-3')
    expect(result.owner_id).toBe('u-4')
  })

  it('maps due_date and timestamps', () => {
    const result = transformActivity(
      makeRaw({
        attributes: {
          due_date: '2025-03-15',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-06-01T00:00:00Z',
        },
      }),
    )
    expect(result.due_date).toBe('2025-03-15')
    expect(result.created_at).toBe('2024-01-01T00:00:00Z')
    expect(result.updated_at).toBe('2024-06-01T00:00:00Z')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformActivity(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformActivity(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformActivity(makeRaw({ id: 't-55' }))
    expect(() => ActivitySchema.parse(result)).not.toThrow()
  })
})

describe('clarify untransformActivity', () => {
  it('wraps output in JSON:API data envelope with type "task"', () => {
    const result = untransformActivity({ subject: 'Send proposal' }) as {
      data: { type: string; attributes: Record<string, unknown> }
    }
    expect(result.data.type).toBe('task')
    expect(result.data.attributes.title).toBe('Send proposal')
  })

  it('maps done=true to status "completed"', () => {
    const result = untransformActivity({ done: true }) as {
      data: { attributes: { status: string } }
    }
    expect(result.data.attributes.status).toBe('completed')
  })

  it('maps done=false to status "pending"', () => {
    const result = untransformActivity({ done: false }) as {
      data: { attributes: { status: string } }
    }
    expect(result.data.attributes.status).toBe('pending')
  })

  it('maps note to notes, and passes through relational ids', () => {
    const result = untransformActivity({
      note: 'Important context',
      contact_id: 'c-1',
      company_id: 'co-2',
      deal_id: 'd-3',
      owner_id: 'u-4',
      due_date: '2025-06-01',
      type: 'email',
    }) as { data: { attributes: Record<string, unknown> } }
    const a = result.data.attributes
    expect(a.notes).toBe('Important context')
    expect(a.contact_id).toBe('c-1')
    expect(a.company_id).toBe('co-2')
    expect(a.deal_id).toBe('d-3')
    expect(a.owner_id).toBe('u-4')
    expect(a.due_date).toBe('2025-06-01')
    expect(a.type).toBe('email')
  })
})
