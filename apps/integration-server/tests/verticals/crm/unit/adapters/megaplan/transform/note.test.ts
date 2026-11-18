import { describe, it, expect } from 'vitest'
import {
  transformNote,
  untransformNote,
  type RawMegaplanNote,
} from '../../../../../../../src/verticals/crm/adapters/megaplan/transform/note'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'

function makeRaw(overrides: Partial<RawMegaplanNote> = {}): RawMegaplanNote {
  return { id: '1', ...overrides }
}

describe('megaplan transformNote', () => {
  it('maps id to string', () => {
    expect(transformNote(makeRaw({ id: 42 })).id).toBe('42')
  })

  it('maps text to content', () => {
    expect(transformNote(makeRaw({ text: 'Great progress' })).content).toBe('Great progress')
  })

  it('defaults content to empty string when text absent', () => {
    expect(transformNote(makeRaw()).content).toBe('')
  })

  it('maps author.id to owner_id', () => {
    expect(transformNote(makeRaw({ author: { id: '5', contentType: 'Employee' } })).owner_id).toBe(
      '5',
    )
  })

  it('routes Deal subject to deal_id', () => {
    const raw = makeRaw({
      subject: { id: '10', contentType: 'Deal' },
      subjectType: 'Deal',
    })
    const result = transformNote(raw)
    expect(result.deal_id).toBe('10')
    expect(result.company_id).toBeUndefined()
    expect(result.contact_id).toBeUndefined()
  })

  it('routes Contractor subject to company_id', () => {
    const raw = makeRaw({
      subject: { id: '20', contentType: 'Contractor' },
      subjectType: 'Contractor',
    })
    const result = transformNote(raw)
    expect(result.company_id).toBe('20')
    expect(result.deal_id).toBeUndefined()
    expect(result.contact_id).toBeUndefined()
  })

  it('routes unknown subject type to contact_id', () => {
    const raw = makeRaw({
      subject: { id: '30', contentType: 'SomeOtherType' },
      subjectType: 'SomeOtherType',
    })
    const result = transformNote(raw)
    expect(result.contact_id).toBe('30')
    expect(result.deal_id).toBeUndefined()
    expect(result.company_id).toBeUndefined()
  })

  it('infers subjectType from subject.contentType when subjectType absent', () => {
    const raw = makeRaw({
      subject: { id: '10', contentType: 'Deal' },
    })
    const result = transformNote(raw)
    expect(result.deal_id).toBe('10')
  })

  it('maps timeCreated to created_at', () => {
    const result = transformNote(makeRaw({ timeCreated: '2024-03-15T10:00:00.000Z' }))
    expect(result.created_at).toBe('2024-03-15T10:00:00.000Z')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformNote(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformNote(raw).metadata).toBe(raw)
  })

  it('passes NoteSchema validation', () => {
    const raw: RawMegaplanNote = {
      id: '1',
      text: 'Follow up on contract',
      author: { id: '5', contentType: 'Employee' },
      subject: { id: '10', contentType: 'Deal' },
      subjectType: 'Deal',
      timeCreated: '2024-01-15T09:30:00.000Z',
      timeUpdated: '2024-02-01T14:20:00.000Z',
    }
    const result = transformNote(raw)
    expect(() => NoteSchema.parse(result)).not.toThrow()
  })
})

describe('megaplan untransformNote', () => {
  it('maps content to text', () => {
    expect(untransformNote({ content: 'Great progress' }).text).toBe('Great progress')
  })

  it('maps owner_id to author object', () => {
    expect(untransformNote({ owner_id: '5' }).author).toEqual({ id: '5' })
  })

  it('maps deal_id to subject with Deal contentType', () => {
    const result = untransformNote({ deal_id: '10' })
    expect(result.subject).toEqual({ id: '10', contentType: 'Deal' })
    expect(result.subjectType).toBe('Deal')
  })

  it('maps company_id to subject with Contractor contentType', () => {
    const result = untransformNote({ company_id: '20' })
    expect(result.subject).toEqual({ id: '20', contentType: 'Contractor' })
    expect(result.subjectType).toBe('Contractor')
  })

  it('maps contact_id to subject with Contractor contentType when no deal or company', () => {
    const result = untransformNote({ contact_id: '30' })
    expect(result.subject).toEqual({ id: '30', contentType: 'Contractor' })
    expect(result.subjectType).toBe('Contractor')
  })
})
