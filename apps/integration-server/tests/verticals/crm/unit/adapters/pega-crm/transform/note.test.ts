import { describe, it, expect } from 'vitest'
import {
  transformNote,
  untransformNote,
  type RawPegaNote,
} from '../../../../../../../src/verticals/crm/adapters/pega-crm/transform/note'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'

function makeRaw(overrides: Partial<RawPegaNote> = {}): RawPegaNote {
  return {
    pzInsKey: 'NOTE-5',
    pyID: 'N-5',
    NoteContent: 'Follow up on Q1 expansion',
    pyOwner: 'operator1',
    ContactID: 'CONT-42',
    AccountID: 'ACCT-7',
    OpportunityID: 'OPP-99',
    pxCreateDateTime: '20260115T093000.000 GMT',
    pxUpdateDateTime: '20260120T120000.000 GMT',
    ...overrides,
  }
}

describe('pega-crm transformNote', () => {
  it('maps id from pzInsKey', () => {
    expect(transformNote(makeRaw()).id).toBe('NOTE-5')
  })

  it('falls back to pyID when pzInsKey absent', () => {
    expect(transformNote(makeRaw({ pzInsKey: undefined })).id).toBe('N-5')
  })

  it('maps content from NoteContent', () => {
    expect(transformNote(makeRaw()).content).toBe('Follow up on Q1 expansion')
  })

  it('falls back to Content when NoteContent absent', () => {
    expect(transformNote(makeRaw({ NoteContent: undefined, Content: 'Alt content' })).content).toBe(
      'Alt content',
    )
  })

  it('falls back to pyNote when NoteContent and Content absent', () => {
    expect(
      transformNote(makeRaw({ NoteContent: undefined, Content: undefined, pyNote: 'pyNote body' }))
        .content,
    ).toBe('pyNote body')
  })

  it('maps contact_id from ContactID', () => {
    expect(transformNote(makeRaw()).contact_id).toBe('CONT-42')
  })

  it('maps company_id from AccountID', () => {
    expect(transformNote(makeRaw()).company_id).toBe('ACCT-7')
  })

  it('maps deal_id from OpportunityID', () => {
    expect(transformNote(makeRaw()).deal_id).toBe('OPP-99')
  })

  it('maps owner_id from pyOwner', () => {
    expect(transformNote(makeRaw()).owner_id).toBe('operator1')
  })

  it('parses Pega compact datetime for created_at', () => {
    expect(transformNote(makeRaw()).created_at).toBe('2026-01-15T09:30:00.000Z')
  })

  it('parses Pega compact datetime for updated_at', () => {
    expect(transformNote(makeRaw()).updated_at).toBe('2026-01-20T12:00:00.000Z')
  })

  it('passes NoteSchema validation', () => {
    expect(() => NoteSchema.parse(transformNote(makeRaw()))).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformNote(raw).metadata).toBe(raw)
  })

  it('untransformNote round-trips content to NoteContent', () => {
    const result = untransformNote({ content: 'Hello world' })
    expect((result as { content: Record<string, unknown> }).content.NoteContent).toBe('Hello world')
  })

  it('untransformNote maps deal_id to OpportunityID', () => {
    const result = untransformNote({ deal_id: 'OPP-99' })
    expect((result as { content: Record<string, unknown> }).content.OpportunityID).toBe('OPP-99')
  })
})
