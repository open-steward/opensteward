import { describe, it, expect } from 'vitest'
import {
  transformActivity,
  untransformActivity,
  type RawCrelateTask,
} from '../../../../../../../src/verticals/crm/adapters/crelate/transform/activity'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'

function makeRaw(overrides: Partial<RawCrelateTask> = {}): RawCrelateTask {
  return { id: 'task-1', ...overrides }
}

describe('crelate transformActivity', () => {
  it('maps id to string', () => {
    expect(transformActivity(makeRaw({ id: 'task-42' })).id).toBe('task-42')
  })

  it('hardcodes type as "task"', () => {
    expect(transformActivity(makeRaw()).type).toBe('task')
  })

  it('maps body to both subject and note', () => {
    const result = transformActivity(makeRaw({ body: 'Call client' }))
    expect(result.subject).toBe('Call client')
    expect(result.note).toBe('Call client')
  })

  it('sets done=true when completed_on is set', () => {
    const result = transformActivity(makeRaw({ completed_on: '2026-03-01T00:00:00.000Z' }))
    expect(result.done).toBe(true)
  })

  it('sets done=false when completed_on is absent', () => {
    expect(transformActivity(makeRaw()).done).toBe(false)
  })

  it('converts due_date via toIsoDatetime', () => {
    const result = transformActivity(makeRaw({ due_date: '2026-06-01T00:00:00.000Z' }))
    expect(result.due_date).toBe('2026-06-01T00:00:00.000Z')
  })

  it('passes integer duration_minutes through', () => {
    const result = transformActivity(makeRaw({ duration_minutes: 45 }))
    expect(result.duration_minutes).toBe(45)
  })

  it('omits non-integer duration_minutes', () => {
    const result = transformActivity(makeRaw({ duration_minutes: 45.5 }))
    expect(result.duration_minutes).toBeUndefined()
  })

  it('picks primary owner', () => {
    const result = transformActivity(
      makeRaw({
        owners: [
          { id: 'usr-1', is_primary: false },
          { id: 'usr-2', is_primary: true },
        ],
      }),
    )
    expect(result.owner_id).toBe('usr-2')
  })

  it('falls back to created_by_id for owner', () => {
    const result = transformActivity(makeRaw({ owners: [], created_by_id: 'usr-creator' }))
    expect(result.owner_id).toBe('usr-creator')
  })

  it('preserves raw as metadata', () => {
    const raw = makeRaw()
    expect(transformActivity(raw).metadata).toBe(raw)
  })

  it('produces an ActivitySchema-valid result', () => {
    const raw = makeRaw({
      body: 'Call client',
      due_date: '2026-06-01T00:00:00.000Z',
      created_on: '2026-01-01T00:00:00.000Z',
    })
    expect(() => ActivitySchema.parse(transformActivity(raw))).not.toThrow()
  })
})

describe('crelate untransformActivity', () => {
  it('maps subject → body (prefers subject over note)', () => {
    const out = untransformActivity({ subject: 'Call client', note: 'Note text' })
    expect(out.body).toBe('Call client')
  })

  it('maps note → body when subject absent', () => {
    const out = untransformActivity({ note: 'Note text' })
    expect(out.body).toBe('Note text')
  })

  it('maps due_date directly', () => {
    const out = untransformActivity({ due_date: '2026-06-01T00:00:00.000Z' })
    expect(out.due_date).toBe('2026-06-01T00:00:00.000Z')
  })

  it('maps duration_minutes directly', () => {
    const out = untransformActivity({ duration_minutes: 30 })
    expect(out.duration_minutes).toBe(30)
  })
})
