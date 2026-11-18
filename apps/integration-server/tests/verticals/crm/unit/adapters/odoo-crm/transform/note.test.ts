/** Fixtures follow Odoo's documented read format; see contact.test.ts. */
import { describe, it, expect } from 'vitest'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'
import {
  transformNote,
  untransformNote,
  type RawOdooNote,
} from '../../../../../../../src/verticals/crm/adapters/odoo-crm/transform/note'

const NOTE: RawOdooNote = {
  id: 90,
  body: '<p>Called, <i>interested</i>.</p>',
  model: 'res.partner',
  res_id: 26,
  create_uid: [2, 'Mitchell Admin'],
  date: '2026-01-15 09:30:00',
  write_date: '2026-01-15 09:31:00',
}

describe('odoo-crm transformNote', () => {
  it('maps a documented mail.message comment onto the canonical note', () => {
    const out = NoteSchema.parse(transformNote(NOTE))
    expect(out).toMatchObject({
      id: '90',
      content: 'Called, interested.',
      contact_id: '26',
      owner_id: '2',
      created_at: '2026-01-15T09:30:00.000Z',
      updated_at: '2026-01-15T09:31:00.000Z',
    })
    expect(out.deal_id).toBeUndefined()
  })

  it('links a crm.lead comment to the deal', () => {
    const out = NoteSchema.parse(transformNote({ ...NOTE, model: 'crm.lead', res_id: 42 }))
    expect(out.deal_id).toBe('42')
    expect(out.contact_id).toBeUndefined()
  })

  it('an empty body is empty content', () => {
    expect(NoteSchema.parse(transformNote({ id: 1, body: false })).content).toBe('')
  })
})

describe('odoo-crm untransformNote', () => {
  it('always sets message_type comment', () => {
    expect(untransformNote({ content: 'x' }).message_type).toBe('comment')
  })
})
