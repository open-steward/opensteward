/**
 * Fixture: one ActivityResource as krayin/rest-api emits it
 * (src/Http/Resources/V1/Activity/ActivityResource.php), with the documented
 * example values of src/Docs/Models/Activity/Activity.php.
 */
import { describe, it, expect } from 'vitest'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'
import {
  transformActivity,
  type RawKrayinActivity,
} from '../../../../../../../src/verticals/crm/adapters/krayin-crm/transform/activity'

function doc(): RawKrayinActivity {
  return {
    id: 1,
    parent_id: null,
    title: 'Meeting with client',
    type: 'meeting',
    comment: 'Discuss project details',
    additional: null,
    schedule_from: '2024-06-01T09:00:00Z',
    schedule_to: '2024-06-01T10:00:00Z',
    is_done: '0',
    user: { id: 1 },
    files: [],
    participants: [],
    location: 'Office',
    created_at: '2020-01-27 17:50:45',
    updated_at: '2020-01-27 17:50:45',
  }
}

describe('krayin-crm transformActivity', () => {
  it('maps the documented resource and satisfies the canonical schema', () => {
    const out = ActivitySchema.parse(transformActivity(doc()))
    expect(out).toMatchObject({
      id: '1',
      type: 'meeting',
      subject: 'Meeting with client',
      note: 'Discuss project details',
      owner_id: '1',
      due_date: '2024-06-01T09:00:00.000Z',
      done: false,
      created_at: '2020-01-27T17:50:45.000Z',
    })
  })

  it('reads is_done 1 / true as done', () => {
    expect(transformActivity({ ...doc(), is_done: 1 }).done).toBe(true)
    expect(transformActivity({ ...doc(), is_done: true }).done).toBe(true)
    expect(transformActivity({ ...doc(), is_done: null }).done).toBeUndefined()
  })

  it('maps no deal link ActivityResource does not emit', () => {
    expect(transformActivity(doc()).deal_id).toBeUndefined()
  })

  it('throws instead of inventing a missing id', () => {
    expect(() => transformActivity({ ...doc(), id: undefined })).toThrow(/no id/)
  })
})
