import { describe, it, expect } from 'vitest'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'
import {
  transformActivity,
  untransformActivity,
  type RawEspoCrmTask,
} from '../../../../../../../src/verticals/crm/adapters/espocrm/transform/activity'

function makeRaw(overrides: Partial<RawEspoCrmTask> = {}): RawEspoCrmTask {
  return { id: '1', ...overrides }
}

describe('espocrm transformActivity', () => {
  it('maps id', () => {
    const result = transformActivity(makeRaw())
    expect(result.id).toBe('1')
  })

  it('throws rather than inventing an id', () => {
    expect(() => transformActivity(makeRaw({ id: undefined }))).toThrow(/Task\.id/)
  })

  it('reads due_date from dateEnd ("Date Due"), not dateStart', () => {
    const result = ActivitySchema.parse(
      transformActivity(
        makeRaw({ dateStart: '2026-12-01 08:00:00', dateEnd: '2026-12-03 17:30:00' }),
      ),
    )
    expect(result.due_date).toBe('2026-12-03T17:30:00Z')
  })

  it('reads an all-day task’s due date from dateEndDate', () => {
    const result = ActivitySchema.parse(
      transformActivity(
        makeRaw({ dateStartDate: '2026-12-01', dateEnd: null, dateEndDate: '2026-12-04' }),
      ),
    )
    expect(result.due_date).toBe('2026-12-04T00:00:00Z')
  })

  it('has no due_date when only dateStart is set', () => {
    const result = ActivitySchema.parse(
      transformActivity(makeRaw({ dateStart: '2026-12-01 08:00:00' })),
    )
    expect(result.due_date).toBeUndefined()
  })

  it('maps subject from name', () => {
    const result = transformActivity(makeRaw({ name: 'Follow up' }))
    expect(result.subject).toBe('Follow up')
  })

  it('maps note from description', () => {
    const result = transformActivity(makeRaw({ description: 'Details' }))
    expect(result.note).toBe('Details')
  })

  it('maps done when status is Completed', () => {
    const result = transformActivity(makeRaw({ status: 'Completed' }))
    expect(result.done).toBe(true)
  })

  it('maps contact_id from contactId', () => {
    const result = transformActivity(makeRaw({ contactId: 'c1' }))
    expect(result.contact_id).toBe('c1')
  })

  it('maps owner_id from assignedUserId', () => {
    const result = transformActivity(makeRaw({ assignedUserId: 'u1' }))
    expect(result.owner_id).toBe('u1')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformActivity(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformActivity(raw).metadata).toBe(raw)
  })

  it('untransforms back to platform shape', () => {
    const result = untransformActivity({ subject: 'Test', done: true })
    expect(result).toBeDefined()
    expect(result.name).toBe('Test')
    expect(result.status).toBe('Completed')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformActivity(makeRaw())
    expect(() => ActivitySchema.parse(result)).not.toThrow()
  })

  it('reads the documented EspoCRM UTC datetimes ("YYYY-MM-DD HH:mm:ss") as ISO 8601', () => {
    const result = ActivitySchema.parse(
      transformActivity(
        makeRaw({
          createdAt: '2026-11-29 12:34:56',
          modifiedAt: '2026-11-30 01:02:03',
          dateEnd: '2026-12-01 08:00:00',
        }),
      ),
    )
    expect(result.created_at).toBe('2026-11-29T12:34:56Z')
    expect(result.updated_at).toBe('2026-11-30T01:02:03Z')
    expect(result.due_date).toBe('2026-12-01T08:00:00Z')
  })
})
