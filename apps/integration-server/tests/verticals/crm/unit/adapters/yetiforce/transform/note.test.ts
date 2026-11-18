/**
 * ModComments raw data (`x-raw-data: 1`, Record_Raw_Details in
 * WebservicePremium.json) with the ModComments field names of YetiForce's
 * install schema.
 */
import { describe, it, expect } from 'vitest'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'
import {
  transformNote,
  untransformNote,
  type RawYetiForceNote,
} from '../../../../../../../src/verticals/crm/adapters/yetiforce/transform/note'

function makeRaw(overrides: RawYetiForceNote = {}): RawYetiForceNote {
  return {
    id: 301,
    commentcontent: 'Called back, wants a quote',
    related_to: 152,
    assigned_user_id: 1,
    createdtime: '2026-01-15 09:30:00',
    modifiedtime: '2026-01-15 09:31:00',
    ...overrides,
  }
}

describe('yetiforce transformNote', () => {
  it('maps the documented fields and parses as a canonical Note', () => {
    const n = NoteSchema.parse(transformNote('301', makeRaw(), 'UTC'))
    expect(n).toMatchObject({
      id: '301',
      content: 'Called back, wants a quote',
      owner_id: '1',
      created_at: '2026-01-15T09:30:00.000Z',
      updated_at: '2026-01-15T09:31:00.000Z',
    })
  })

  it('does not guess which module related_to points at', () => {
    const n = transformNote('301', makeRaw(), 'UTC')
    expect(n.deal_id).toBeUndefined()
    expect(n.contact_id).toBeUndefined()
    expect(n.company_id).toBeUndefined()
  })

  it('throws instead of inventing content when commentcontent is missing', () => {
    expect(() => transformNote('301', makeRaw({ commentcontent: undefined }), 'UTC')).toThrow(
      /commentcontent/,
    )
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformNote('301', raw, 'UTC').metadata).toBe(raw)
  })
})

describe('yetiforce untransformNote', () => {
  it('maps content to commentcontent', () => {
    expect(untransformNote({ content: 'text' }).commentcontent).toBe('text')
  })
})
