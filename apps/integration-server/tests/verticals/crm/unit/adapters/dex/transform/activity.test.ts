/**
 * Fixture fields from GET /v1/reminders/ ("data.items[].id string (uuid) required",
 * "data.items[].text string | null", "data.items[].due_at_date string (date-time)",
 * "data.items[].due_at_time string (date-time)", "data.items[].is_complete boolean",
 * "data.items[].created_at string (date-time)", "data.items[].reminders_contacts array<object>")
 * at https://getdex.com/docs/api-reference/reference/v1/reminders/list-reminders.
 */
import { describe, it, expect } from 'vitest'
import {
  transformActivity,
  untransformActivity,
  type RawDexReminder,
} from '../../../../../../../src/verticals/crm/adapters/dex/transform/activity'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'

const ID = '9c8b7a6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d'
const CONTACT = '3f2b8c1e-5d4a-4b6f-9a1e-2c3d4e5f6a7b'

function makeRaw(overrides: Partial<RawDexReminder> = {}): RawDexReminder {
  return {
    id: ID,
    text: 'Call Jane about Q1',
    due_at_date: '2026-06-01T00:00:00.000Z',
    due_at_time: null,
    is_complete: false,
    recurrence: null,
    created_at: '2026-01-01T00:00:00.000Z',
    reminders_contacts: [{ contact_id: CONTACT }],
    ...overrides,
  }
}

describe('dex transformActivity (v1 reminder)', () => {
  it('maps the documented fields and parses as an Activity', () => {
    const a = ActivitySchema.parse(transformActivity(makeRaw()))
    expect(a).toMatchObject({
      id: ID,
      type: 'task',
      subject: 'Call Jane about Q1',
      contact_id: CONTACT,
      due_date: '2026-06-01T00:00:00.000Z',
      done: false,
      created_at: '2026-01-01T00:00:00.000Z',
    })
    expect(a.updated_at).toBeUndefined()
  })

  it('maps is_complete true to done', () => {
    expect(ActivitySchema.parse(transformActivity(makeRaw({ is_complete: true }))).done).toBe(true)
  })

  it('leaves done unknown when is_complete is absent', () => {
    const a = ActivitySchema.parse(transformActivity({ id: ID }))
    expect(a.done).toBeUndefined()
    expect(a.due_date).toBeUndefined()
  })

  it('preserves raw as metadata', () => {
    const raw = makeRaw()
    expect(transformActivity(raw).metadata).toBe(raw)
  })
})

describe('dex untransformActivity', () => {
  it('maps subject → title and done → is_complete', () => {
    const out = untransformActivity({ subject: 'Call client', done: true })
    expect(out.title).toBe('Call client')
    expect(out.is_complete).toBe(true)
  })
})
