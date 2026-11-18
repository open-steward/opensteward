import { describe, it, expect } from 'vitest'
import {
  transformActivity,
  untransformActivity,
  type RawSimplicateAppointment,
} from '../../../../../../../src/verticals/crm/adapters/simplicate/transform/activity'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'

function makeRaw(overrides: Partial<RawSimplicateAppointment> = {}): RawSimplicateAppointment {
  return { id: 'appointment:aabb1122', ...overrides }
}

describe('simplicate transformActivity', () => {
  it('maps id to string', () => {
    expect(transformActivity(makeRaw({ id: 'appointment:xyz' })).id).toBe('appointment:xyz')
  })

  it('maps subject', () => {
    expect(transformActivity(makeRaw({ subject: 'Discovery call' })).subject).toBe('Discovery call')
  })

  it('maps note', () => {
    expect(transformActivity(makeRaw({ note: 'Agenda TBD' })).note).toBe('Agenda TBD')
  })

  it('maps activity_type to type', () => {
    expect(transformActivity(makeRaw({ activity_type: 'call' })).type).toBe('call')
  })

  it('maps person_id to contact_id', () => {
    expect(transformActivity(makeRaw({ person_id: 'person:p1' })).contact_id).toBe('person:p1')
  })

  it('maps null person_id to undefined contact_id', () => {
    expect(transformActivity(makeRaw({ person_id: null })).contact_id).toBeUndefined()
  })

  it('maps organization_id to company_id', () => {
    expect(transformActivity(makeRaw({ organization_id: 'organization:o1' })).company_id).toBe(
      'organization:o1',
    )
  })

  it('maps project_id to deal_id', () => {
    expect(transformActivity(makeRaw({ project_id: 'sales:s1' })).deal_id).toBe('sales:s1')
  })

  it('maps employee_id to owner_id', () => {
    expect(transformActivity(makeRaw({ employee_id: 'emp:e1' })).owner_id).toBe('emp:e1')
  })

  it('maps start_date to due_date', () => {
    expect(transformActivity(makeRaw({ start_date: '2025-05-01T10:00:00+00:00' })).due_date).toBe(
      '2025-05-01T10:00:00+00:00',
    )
  })

  it('maps is_completed to done', () => {
    expect(transformActivity(makeRaw({ is_completed: true })).done).toBe(true)
    expect(transformActivity(makeRaw({ is_completed: false })).done).toBe(false)
  })

  it('defaults done to false when is_completed absent', () => {
    // Source: raw.is_completed ?? false
    expect(transformActivity(makeRaw()).done).toBe(false)
  })

  it('maps created_at and updated_at as-is', () => {
    const result = transformActivity(
      makeRaw({
        created_at: '2024-02-01T08:00:00+00:00',
        updated_at: '2024-05-01T08:00:00+00:00',
      }),
    )
    expect(result.created_at).toBe('2024-02-01T08:00:00+00:00')
    expect(result.updated_at).toBe('2024-05-01T08:00:00+00:00')
  })

  it('preserves raw metadata', () => {
    const raw = makeRaw({ subject: 'Meeting' })
    expect(transformActivity(raw).metadata).toBe(raw)
  })

  it('produces schema-valid output', () => {
    const raw: RawSimplicateAppointment = {
      id: 'appointment:aa001122',
      subject: 'Kick-off call',
      note: 'Discuss requirements',
      activity_type: 'call',
      person_id: 'person:p1',
      organization_id: 'organization:o1',
      project_id: 'sales:s1',
      employee_id: 'emp:e1',
      start_date: '2025-06-01T14:00:00+00:00',
      is_completed: false,
      created_at: '2024-01-01T00:00:00+00:00',
      updated_at: '2024-06-01T00:00:00+00:00',
    }
    expect(() => ActivitySchema.parse(transformActivity(raw))).not.toThrow()
  })
})

describe('simplicate untransformActivity', () => {
  it('maps type to activity_type', () => {
    expect(untransformActivity({ type: 'meeting' })).toMatchObject({ activity_type: 'meeting' })
  })

  it('maps subject', () => {
    expect(untransformActivity({ subject: 'Call' })).toMatchObject({ subject: 'Call' })
  })

  it('maps contact_id to person_id', () => {
    expect(untransformActivity({ contact_id: 'person:p9' })).toMatchObject({
      person_id: 'person:p9',
    })
  })

  it('maps done to is_completed', () => {
    expect(untransformActivity({ done: true })).toMatchObject({ is_completed: true })
  })

  it('omits unset fields', () => {
    expect(Object.keys(untransformActivity({}))).toHaveLength(0)
  })
})
