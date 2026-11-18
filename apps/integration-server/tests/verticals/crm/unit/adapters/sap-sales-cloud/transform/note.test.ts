import { describe, it, expect } from 'vitest'
import {
  transformNote,
  untransformNote,
  type RawSapNote,
} from '../../../../../../../src/verticals/crm/adapters/sap-sales-cloud/transform/note'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'

function makeRaw(overrides: Partial<RawSapNote> = {}): RawSapNote {
  return { id: 'note-001', ...overrides }
}

describe('sap-sales-cloud transformNote', () => {
  it('maps id to string', () => {
    expect(transformNote(makeRaw({ id: 'note-77' })).id).toBe('note-77')
  })

  it('maps text to content, falling back to empty string', () => {
    expect(transformNote(makeRaw({ text: 'Discussed pricing' })).content).toBe('Discussed pricing')
    expect(transformNote(makeRaw()).content).toBe('')
  })

  it('maps contactId to contact_id', () => {
    expect(transformNote(makeRaw({ contactId: 'cont-8' })).contact_id).toBe('cont-8')
  })

  it('maps accountId to company_id', () => {
    expect(transformNote(makeRaw({ accountId: 'acc-3' })).company_id).toBe('acc-3')
  })

  it('maps opportunityId to deal_id', () => {
    expect(transformNote(makeRaw({ opportunityId: 'opp-5' })).deal_id).toBe('opp-5')
  })

  it('maps ownerId to owner_id', () => {
    expect(transformNote(makeRaw({ ownerId: 'usr-2' })).owner_id).toBe('usr-2')
  })

  it('coerces createdAt through toIsoDatetime', () => {
    const result = transformNote(makeRaw({ createdAt: '2025-03-10T15:30:00.000Z' }))
    expect(result.created_at).toBe('2025-03-10T15:30:00.000Z')
  })

  it('preserves raw metadata', () => {
    const raw = makeRaw({ text: 'Hello' })
    expect(transformNote(raw).metadata).toBe(raw)
  })

  it('produces schema-valid output', () => {
    const raw: RawSapNote = {
      id: 'note-99',
      text: 'Customer asked for a revised quote',
      contactId: 'cont-1',
      accountId: 'acc-1',
      opportunityId: 'opp-1',
      ownerId: 'usr-1',
      createdAt: '2025-01-15T09:30:00.000Z',
      lastModifiedAt: '2025-01-20T12:00:00.000Z',
    }
    expect(() => NoteSchema.parse(transformNote(raw))).not.toThrow()
  })
})

describe('sap-sales-cloud untransformNote', () => {
  it('maps content to text', () => {
    expect(untransformNote({ content: 'Body text' })).toMatchObject({ text: 'Body text' })
  })

  it('maps contact_id to contactId', () => {
    expect(untransformNote({ contact_id: 'cont-4' })).toMatchObject({ contactId: 'cont-4' })
  })

  it('maps company_id to accountId', () => {
    expect(untransformNote({ company_id: 'acc-7' })).toMatchObject({ accountId: 'acc-7' })
  })

  it('maps deal_id to opportunityId', () => {
    expect(untransformNote({ deal_id: 'opp-2' })).toMatchObject({ opportunityId: 'opp-2' })
  })

  it('omits unset fields', () => {
    expect(Object.keys(untransformNote({}))).toHaveLength(0)
  })
})
