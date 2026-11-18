/**
 * Fixtures from https://developer.clientify.com/ (the Postman collection):
 * LISTED is the first result of "List Tasks", DETAIL the "Task Details"
 * example, values verbatim.
 */
import { describe, it, expect } from 'vitest'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'
import {
  transformActivity,
  untransformActivity,
  type RawClientifyActivity,
} from '../../../../../../../src/verticals/crm/adapters/clientify/transform/activity'

const LISTED: RawClientifyActivity = {
  url: 'https://api.clientify.net/v1/tasks/194144/',
  id: 194144,
  owner: 'pedro.diez@clientify.com',
  owner_name: 'Pedro D. Diez',
  assigned_to: 'pedro.diez@clientify.com',
  assigned_to_name: 'Pedro D. Diez',
  name: 'Creating a Task from Postman 1',
  description: '',
  remarks: '',
  due_date: '2019-03-08T12:00:00+01:00',
  type: 1,
  status: 1,
  status_desc: 'Not started',
  deals: [],
  task_type: 'https://api.clientify.net/v1/tasks/types/66/',
  type_desc: 'Mandar email',
  task_stage: null,
  related_companies: ['https://api.clientify.net/v1/companies/830499/'],
  related_contacts: ['https://api.clientify.net/v1/contacts/4763086/'],
}

const DETAIL: RawClientifyActivity = {
  url: 'https://api.clientify.net/v1/tasks/1/',
  id: 1,
  owner: 'franjlm@gmail.com',
  assigned_to: 'franjlm@gmail.com',
  name: 'Recordar Pago',
  due_date: '2014-08-01T23:59:51+02:00',
  type: 3,
  status: 5,
  deals: ['https://api.clientify.net/v1/deals/4/'],
  related_companies: ['https://api.clientify.net/v1/companies/626/'],
  related_contacts: [],
}

describe('clientify transformActivity (tasks)', () => {
  it('maps the documented list row and parses as a canonical Activity', () => {
    const out = ActivitySchema.parse(transformActivity(LISTED))
    expect(out).toMatchObject({
      id: '194144',
      type: 'task',
      subject: 'Creating a Task from Postman 1',
      due_date: '2019-03-08T12:00:00+01:00',
      done: false,
      contact_id: '4763086',
      company_id: '830499',
    })
    expect(out.deal_id).toBeUndefined()
    expect(out.note).toBeUndefined()
  })

  it('marks COMPLETED_STATUS (5) done and reads the deal link', () => {
    const out = ActivitySchema.parse(transformActivity(DETAIL))
    expect(out).toMatchObject({ id: '1', done: true, deal_id: '4', company_id: '626' })
    expect(out.contact_id).toBeUndefined()
  })

  it('leaves done unknown when the task carries no status', () => {
    expect(transformActivity({ ...LISTED, status: undefined }).done).toBeUndefined()
    expect(transformActivity({ ...LISTED, status: 1 }).done).toBe(false)
  })

  it('carries a non-empty description as the note', () => {
    const out = transformActivity({ ...LISTED, description: 'Creating new task from postman' })
    expect(out.note).toBe('Creating new task from postman')
  })

  it('does not treat the owner e-mail as an owner id', () => {
    expect(transformActivity(LISTED).owner_id).toBeUndefined()
  })

  it('preserves raw metadata by reference', () => {
    expect(transformActivity(LISTED).metadata).toBe(LISTED)
  })

  it('untransforms back to platform shape', () => {
    expect(untransformActivity({ subject: 'Call' }).subject).toBe('Call')
  })
})
