import { describe, it, expect } from 'vitest'
import {
  transformActivity,
  untransformActivity,
  type RawCasAppointment,
} from '../../../../../../../src/verticals/crm/adapters/cas-genesisworld/transform/activity'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'

function makeRaw(overrides: Partial<RawCasAppointment> = {}): RawCasAppointment {
  return { GWGUID: 'guid-1', ...overrides }
}

describe('cas-genesisworld transformActivity', () => {
  it('maps GWGUID to string id', () => {
    expect(transformActivity(makeRaw({ GWGUID: 'abc-123' })).id).toBe('abc-123')
  })

  it('maps Subject to subject', () => {
    const result = transformActivity(makeRaw({ Subject: 'Team standup' }))
    expect(result.subject).toBe('Team standup')
  })

  it('maps Note to note', () => {
    const result = transformActivity(makeRaw({ Note: 'Discuss roadmap' }))
    expect(result.note).toBe('Discuss roadmap')
  })

  it('maps AppointmentType 1 to meeting', () => {
    expect(transformActivity(makeRaw({ AppointmentType: '1' })).type).toBe('meeting')
  })

  it('maps AppointmentType 2 to call', () => {
    expect(transformActivity(makeRaw({ AppointmentType: '2' })).type).toBe('call')
  })

  it('maps AppointmentType 3 to email', () => {
    expect(transformActivity(makeRaw({ AppointmentType: '3' })).type).toBe('email')
  })

  it('maps AppointmentType 4 to task', () => {
    expect(transformActivity(makeRaw({ AppointmentType: '4' })).type).toBe('task')
  })

  it('maps AppointmentType numeric 1 to meeting', () => {
    expect(transformActivity(makeRaw({ AppointmentType: 1 })).type).toBe('meeting')
  })

  it('maps StartDate to due_date', () => {
    const result = transformActivity(makeRaw({ StartDate: '2026-06-01T09:00:00.000Z' }))
    expect(result.due_date).toBe('2026-06-01T09:00:00.000Z')
  })

  it('maps Done boolean true to done', () => {
    expect(transformActivity(makeRaw({ Done: true })).done).toBe(true)
  })

  it('maps Done number 0 to false', () => {
    expect(transformActivity(makeRaw({ Done: 0 })).done).toBe(false)
  })

  it('maps Done string "true" to true', () => {
    expect(transformActivity(makeRaw({ Done: 'true' })).done).toBe(true)
  })

  it('returns undefined done when Done is absent', () => {
    expect(transformActivity(makeRaw()).done).toBeUndefined()
  })

  it('parses Duration to duration_minutes integer', () => {
    expect(transformActivity(makeRaw({ Duration: '60' })).duration_minutes).toBe(60)
  })

  it('maps UserGGUID to owner_id', () => {
    expect(transformActivity(makeRaw({ UserGGUID: 'usr-7' })).owner_id).toBe('usr-7')
  })

  it('maps ContactGGUID to contact_id', () => {
    expect(transformActivity(makeRaw({ ContactGGUID: 'con-3' })).contact_id).toBe('con-3')
  })

  it('maps CompanyGGUID to company_id', () => {
    expect(transformActivity(makeRaw({ CompanyGGUID: 'co-5' })).company_id).toBe('co-5')
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
      Subject: 'Kickoff call',
      Note: 'Introduction meeting',
      AppointmentType: '2',
      StartDate: '2026-06-01T09:00:00.000Z',
      Done: false,
      Duration: 30,
      UserGGUID: 'usr-1',
      ContactGGUID: 'con-2',
      CompanyGGUID: 'co-3',
      CreateDate: '2026-01-01T00:00:00.000Z',
      UpdateDate: '2026-02-01T00:00:00.000Z',
    })
    expect(() => ActivitySchema.parse(transformActivity(raw))).not.toThrow()
  })
})

describe('cas-genesisworld untransformActivity', () => {
  it('maps subject to Subject', () => {
    const result = untransformActivity({ subject: 'Standup' })
    expect(result.Subject).toBe('Standup')
  })

  it('maps note to Note', () => {
    const result = untransformActivity({ note: 'Agenda' })
    expect(result.Note).toBe('Agenda')
  })

  it('maps due_date to StartDate', () => {
    const result = untransformActivity({ due_date: '2026-06-01T09:00:00.000Z' })
    expect(result.StartDate).toBe('2026-06-01T09:00:00.000Z')
  })

  it('maps owner_id to UserGGUID', () => {
    const result = untransformActivity({ owner_id: 'usr-9' })
    expect(result.UserGGUID).toBe('usr-9')
  })

  it('maps type "meeting" back to numeric AppointmentType 1', () => {
    const result = untransformActivity({ type: 'meeting' })
    expect(result.AppointmentType).toBe(1)
  })

  it('maps type "call" back to numeric AppointmentType 2', () => {
    const result = untransformActivity({ type: 'call' })
    expect(result.AppointmentType).toBe(2)
  })

  it('maps duration_minutes to Duration', () => {
    const result = untransformActivity({ duration_minutes: 45 })
    expect(result.Duration).toBe(45)
  })

  it('omits undefined fields', () => {
    const result = untransformActivity({})
    expect(Object.keys(result)).toHaveLength(0)
  })
})
