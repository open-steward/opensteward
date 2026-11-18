/**
 * Entity fixture from SuperOffice.CRM.Services.AppointmentEntity
 * (openapi-v3-Appointment.json, GET /api/v1/Appointment/{id}); row fixture from the
 * "FindAppointment" archive columns (archive-providers/reference/findappointment).
 */
import { describe, it, expect } from 'vitest'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'
import {
  transformActivity,
  transformActivityRow,
  untransformActivity,
} from '../../../../../../../src/verticals/crm/adapters/superoffice/transform/activity'

const APPOINTMENT = {
  AppointmentId: 900,
  Title: 'Kick-off',
  Description: 'Agree the rollout plan',
  Task: { TaskListItemId: 5, Value: 'Meeting' },
  Type: 'inDiary',
  StartDate: '2024-05-01T09:00:00+02:00',
  EndDate: '2024-05-01T10:00:00+02:00',
  Completed: 'Completed',
  Person: { PersonId: 123 },
  Contact: { ContactId: 77 },
  Sale: { SaleId: 500 },
  Associate: { AssociateId: 12 },
  CreatedDate: '2024-04-20T08:00:00',
  UpdatedDate: '2024-04-21T08:00:00',
}

describe('superoffice transformActivity (AppointmentEntity)', () => {
  it('maps the documented AppointmentEntity fields', () => {
    const a = ActivitySchema.parse(transformActivity(APPOINTMENT))
    expect(a).toMatchObject({
      id: '900',
      type: 'Meeting',
      subject: 'Kick-off',
      note: 'Agree the rollout plan',
      contact_id: '123',
      company_id: '77',
      deal_id: '500',
      owner_id: '12',
      due_date: '2024-05-01T09:00:00+02:00',
      done: true,
      created_at: '2024-04-20T08:00:00Z',
      updated_at: '2024-04-21T08:00:00Z',
    })
    expect(a.metadata).toEqual(APPOINTMENT)
  })

  it('reads the Completed enum', () => {
    expect(transformActivity({ ...APPOINTMENT, Completed: 'NotStarted' }).done).toBe(false)
    expect(transformActivity({ ...APPOINTMENT, Completed: 'Started' }).done).toBe(false)
    expect(transformActivity({ ...APPOINTMENT, Completed: 'Unknown' }).done).toBeUndefined()
  })

  it('throws without an AppointmentId', () => {
    expect(() => transformActivity({ Title: 'x' })).toThrow(/no id/)
  })

  it('untransforms activity data (write path unchanged)', () => {
    expect(untransformActivity({ done: true }).Completed).toBe('Completed')
  })
})

describe('superoffice transformActivityRow (FindAppointment archive)', () => {
  const ROW = {
    PrimaryKey: '900',
    EntityName: 'appointment',
    type: 'Meeting',
    text: 'Agree the rollout plan',
    saleId: '500',
    completed: true,
    date: '2024-05-01T09:00:00',
    registeredDate: '2024-04-20T08:00:00',
    updatedDate: '2024-04-21T08:00:00',
  }

  it('maps the selected columns', () => {
    const a = ActivitySchema.parse(transformActivityRow(ROW))
    expect(a).toMatchObject({
      id: '900',
      type: 'Meeting',
      note: 'Agree the rollout plan',
      deal_id: '500',
      done: true,
      created_at: '2024-04-20T08:00:00Z',
      updated_at: '2024-04-21T08:00:00Z',
    })
    expect(a.due_date).toBeUndefined()
    expect(a.metadata).toEqual(ROW)
  })

  it('reads completed only as a logical boolean', () => {
    expect(transformActivityRow({ ...ROW, completed: false }).done).toBe(false)
    expect(transformActivityRow({ ...ROW, completed: 'icon:checked' }).done).toBeUndefined()
  })
})
