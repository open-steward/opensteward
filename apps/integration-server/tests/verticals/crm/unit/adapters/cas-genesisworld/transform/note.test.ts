import { describe, it, expect } from 'vitest'
import {
  transformNote,
  untransformNote,
  type RawCasTodo,
} from '../../../../../../../src/verticals/crm/adapters/cas-genesisworld/transform/note'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'

function makeRaw(overrides: Partial<RawCasTodo> = {}): RawCasTodo {
  return { GWGUID: 'guid-1', Note: 'Meeting recap', ...overrides }
}

describe('cas-genesisworld transformNote', () => {
  it('maps GWGUID to string id', () => {
    expect(transformNote(makeRaw({ GWGUID: 'note-abc' })).id).toBe('note-abc')
  })

  it('maps Note field to content', () => {
    expect(transformNote(makeRaw({ Note: 'Important details' })).content).toBe('Important details')
  })

  it('falls back to Subject when Note is absent', () => {
    const result = transformNote({ GWGUID: 'n1', Subject: 'Follow-up' })
    expect(result.content).toBe('Follow-up')
  })

  it('defaults content to empty string when both Note and Subject absent', () => {
    const result = transformNote({ GWGUID: 'n1' })
    expect(result.content).toBe('')
  })

  it('maps ContactGGUID to contact_id', () => {
    expect(transformNote(makeRaw({ ContactGGUID: 'con-3' })).contact_id).toBe('con-3')
  })

  it('maps CompanyGGUID to company_id', () => {
    expect(transformNote(makeRaw({ CompanyGGUID: 'co-5' })).company_id).toBe('co-5')
  })

  it('maps UserGGUID to owner_id', () => {
    expect(transformNote(makeRaw({ UserGGUID: 'usr-2' })).owner_id).toBe('usr-2')
  })

  it('maps CreateDate/UpdateDate to created_at/updated_at', () => {
    const result = transformNote(
      makeRaw({
        CreateDate: '2026-01-01T00:00:00.000Z',
        UpdateDate: '2026-02-01T00:00:00.000Z',
      }),
    )
    expect(result.created_at).toBe('2026-01-01T00:00:00.000Z')
    expect(result.updated_at).toBe('2026-02-01T00:00:00.000Z')
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformNote(raw).metadata).toBe(raw)
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformNote(makeRaw())).not.toThrow()
  })

  it('produces output that passes NoteSchema.parse', () => {
    const raw = makeRaw({
      Note: 'Call notes',
      ContactGGUID: 'con-1',
      CompanyGGUID: 'co-2',
      UserGGUID: 'usr-3',
      CreateDate: '2026-01-01T00:00:00.000Z',
      UpdateDate: '2026-02-01T00:00:00.000Z',
    })
    expect(() => NoteSchema.parse(transformNote(raw))).not.toThrow()
  })
})

describe('cas-genesisworld untransformNote', () => {
  it('maps content to Note', () => {
    const result = untransformNote({ content: 'My note' })
    expect(result.Note).toBe('My note')
  })

  it('maps owner_id to UserGGUID', () => {
    const result = untransformNote({ owner_id: 'usr-4' })
    expect(result.UserGGUID).toBe('usr-4')
  })

  it('maps contact_id to ContactGGUID', () => {
    const result = untransformNote({ contact_id: 'con-1' })
    expect(result.ContactGGUID).toBe('con-1')
  })

  it('maps company_id to CompanyGGUID', () => {
    const result = untransformNote({ company_id: 'co-2' })
    expect(result.CompanyGGUID).toBe('co-2')
  })

  it('omits undefined fields', () => {
    const result = untransformNote({})
    expect(Object.keys(result)).toHaveLength(0)
  })
})
