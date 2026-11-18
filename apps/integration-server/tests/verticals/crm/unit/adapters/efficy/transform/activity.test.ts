/**
 * Fixture: the `example` values of `Appointment_GET` in
 * https://help.efficy.cloud/api/efficyU_public_api_spec.yaml
 * (response of GET /api/v1/meetings and GET /api/v1/meetings/{id}).
 */
import { describe, it, expect } from 'vitest'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'
import {
  transformActivity,
  untransformActivity,
  type RawEfficyActivity,
} from '../../../../../../../src/verticals/crm/adapters/efficy/transform/activity'

const MEETING_EXAMPLE: RawEfficyActivity = {
  crm_id: '00010QH200001PKZ',
  created_by: 'JODOE',
  creation_date: '2024-11-14T13:31:40.033Z',
  description: 'This is an important Meeting',
  duration: 2160,
  end_date: '2025-01-15T10:35:54.603Z',
  is_all_day: false,
  is_online: true,
  last_update_date: '2024-11-18T13:31:40.033Z',
  last_updated_by: 'JODOE',
  organizer: 'JODOE',
  recurrence: 'FREQ=DAILY;UNTIL=20250124T143000Z',
  start_date: '2025-01-15T09:35:54.603Z',
  status: 'Upcoming',
  title: 'Alignement Meeting',
}

describe('efficy transformActivity (meetings)', () => {
  it('maps the documented Appointment_GET fields and parses as a canonical Activity', () => {
    const a = ActivitySchema.parse(transformActivity(MEETING_EXAMPLE))
    expect(a.id).toBe('00010QH200001PKZ')
    expect(a.type).toBe('meeting')
    expect(a.subject).toBe('Alignement Meeting')
    expect(a.note).toBe('This is an important Meeting')
    expect(a.due_date).toBe('2025-01-15T09:35:54.603Z')
    // "The duration of the meeting in seconds (e.g., 1800 for 30 minutes or 3600 for 1 hour)."
    expect(a.duration_minutes).toBe(36)
    expect(a.created_at).toBe('2024-11-14T13:31:40.033Z')
    expect(a.updated_at).toBe('2024-11-18T13:31:40.033Z')
    // organizer is a user code (JODOE), not a user crm_id: not an owner_id.
    expect(a.owner_id).toBeUndefined()
    expect(a.metadata).toEqual(MEETING_EXAMPLE)
  })

  it('refuses a record with no crm_id instead of inventing an id', () => {
    expect(() => transformActivity({ title: 'x' })).toThrow(/crm_id/)
  })

  it('untransforms back to the write body', () => {
    const result = untransformActivity({ subject: 'Test', type: 'meeting' })
    expect(result.SUBJECT).toBe('Test')
    expect(result.ACTIONTYPE).toBe('meeting')
  })
})
