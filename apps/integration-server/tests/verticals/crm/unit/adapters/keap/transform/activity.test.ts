/**
 * Fixtures are built from the documented examples in the Keap REST v2 OpenAPI
 * spec (https://crm.infusionsoft.com/app/v3/api-docs/V2). The spec types ids
 * and timestamps as strings, so the fixture values are strings.
 */
import { describe, it, expect } from 'vitest'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'
import {
  transformActivity,
  untransformActivity,
  type RawKeapTask,
} from '../../../../../../../src/verticals/crm/adapters/keap/transform/activity'

/** Documented `Task` example values. */
const DOC: RawKeapTask = {
  id: '123',
  title: 'Follow up on proposal',
  description: 'Review and respond to client feedback.',
  type: 'CALL',
  completed: false,
  create_time: '2024-01-10T08:00:00Z',
  modification_time: '2024-03-15T10:30:00Z',
  due_time: '2024-03-18T17:00:00Z',
  assigned_to_user_id: '456',
  contact_id: '1001',
  opportunity_id: '321',
}

describe('keap transformActivity', () => {
  it('maps the documented example and satisfies the schema', () => {
    const result = ActivitySchema.parse(transformActivity(DOC))
    expect(result).toMatchObject({
      id: '123',
      type: 'task',
      subject: 'Follow up on proposal',
      note: 'Review and respond to client feedback.',
      due_date: '2024-03-18T17:00:00Z',
      contact_id: '1001',
      deal_id: '321',
      owner_id: '456',
      done: false,
      created_at: '2024-01-10T08:00:00Z',
      updated_at: '2024-03-15T10:30:00Z',
    })
  })

  it('marks done when completed is true', () => {
    expect(transformActivity({ ...DOC, completed: true }).done).toBe(true)
  })

  it('leaves done unset when completed is absent', () => {
    expect(transformActivity({ id: '11' }).done).toBeUndefined()
  })

  it('a bare record satisfies the schema', () => {
    expect(() => ActivitySchema.parse(transformActivity({ id: '11' }))).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    expect(transformActivity(DOC).metadata).toBe(DOC)
  })
})

describe('keap untransformActivity', () => {
  it('maps subject to title', () => {
    expect(untransformActivity({ subject: 'Follow up' }).title).toBe('Follow up')
  })
})
