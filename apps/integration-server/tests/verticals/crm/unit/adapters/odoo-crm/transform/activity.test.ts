/** Fixtures follow Odoo's documented read format; see contact.test.ts. */
import { describe, it, expect } from 'vitest'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'
import {
  transformActivity,
  untransformActivity,
  type RawOdooActivity,
} from '../../../../../../../src/verticals/crm/adapters/odoo-crm/transform/activity'

const ACTIVITY: RawOdooActivity = {
  id: 7,
  summary: 'Discovery call',
  note: '<p>Follow up on <b>Q1</b></p>',
  date_deadline: '2026-02-01',
  res_model: 'crm.lead',
  res_id: 42,
  user_id: [2, 'Mitchell Admin'],
  activity_type_id: [2, 'Call'],
  create_date: '2026-01-15 09:30:00',
  write_date: '2026-01-16 10:00:00',
}

describe('odoo-crm transformActivity', () => {
  it('maps a documented mail.activity row onto the canonical activity', () => {
    const out = ActivitySchema.parse(transformActivity(ACTIVITY))
    expect(out).toMatchObject({
      id: '7',
      type: 'Call',
      subject: 'Discovery call',
      note: 'Follow up on Q1',
      due_date: '2026-02-01T00:00:00.000Z',
      owner_id: '2',
      deal_id: '42',
      created_at: '2026-01-15T09:30:00.000Z',
      updated_at: '2026-01-16T10:00:00.000Z',
    })
    expect(out.contact_id).toBeUndefined()
  })

  it('links a res.partner activity to the contact', () => {
    const out = ActivitySchema.parse(
      transformActivity({ ...ACTIVITY, res_model: 'res.partner', res_id: 26 }),
    )
    expect(out.contact_id).toBe('26')
    expect(out.deal_id).toBeUndefined()
  })

  it('reads false as absent', () => {
    const out = ActivitySchema.parse(
      transformActivity({
        id: 1,
        summary: false,
        note: false,
        res_model: false,
        res_id: false,
        user_id: false,
        activity_type_id: false,
      }),
    )
    expect(out).toMatchObject({ id: '1' })
    expect(out.note).toBeUndefined()
    expect(out.type).toBeUndefined()
  })
})

describe('odoo-crm untransformActivity', () => {
  it('links a contact through res_model/res_id', () => {
    expect(untransformActivity({ contact_id: '5' })).toMatchObject({
      res_model: 'res.partner',
      res_id: 5,
    })
  })
})
