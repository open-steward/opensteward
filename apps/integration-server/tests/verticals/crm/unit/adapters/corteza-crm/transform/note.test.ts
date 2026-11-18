import { describe, it, expect } from 'vitest'
import {
  transformNote,
  untransformNote,
  type RawCortezaNote,
} from '../../../../../../../src/verticals/crm/adapters/corteza-crm/transform/note'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'

function makeRaw(overrides: Partial<RawCortezaNote> = {}): RawCortezaNote {
  return {
    recordID: 'rec-1',
    moduleID: 'mod-1',
    namespaceID: 'ns-1',
    values: [{ name: 'Note', value: 'A note body' }],
    ...overrides,
  }
}

// Fixture shape: the record in docs.cortezaproject.org "Working With Low Code
// Records" ({ recordID, moduleID, values: [{ name, value }], namespaceID }),
// plus createdAt/updatedAt from server/compose/types/record.go. Field names
// are the module's in corteza-server provision/700_crm/1100_modules.yaml.
describe('corteza-crm transformNote', () => {
  const doc = makeRaw({
    recordID: '312345678901234999',
    moduleID: '212345678901234005',
    namespaceID: '112345678901234567',
    values: [
      { name: 'Title', value: 'Call summary' },
      { name: 'Body', value: 'Agreed on pricing' },
      { name: 'ContactId', value: '312345678901234567' },
      { name: 'AccountId', value: '312345678901234001' },
      { name: 'OpportunityId', value: '312345678901234777' },
    ],
    createdAt: '2026-01-01T10:00:00Z',
  })

  it('maps the documented record to a NoteSchema-valid note', () => {
    expect(NoteSchema.parse(transformNote(doc))).toMatchObject({
      id: '312345678901234999',
      content: 'Agreed on pricing',
      contact_id: '312345678901234567',
      company_id: '312345678901234001',
      deal_id: '312345678901234777',
      created_at: '2026-01-01T10:00:00.000Z',
    })
  })

  it('an omitted Body is the empty body, not the Title', () => {
    const raw = makeRaw({ values: [{ name: 'Title', value: 'Heading' }] })
    expect(NoteSchema.parse(transformNote(raw)).content).toBe('')
  })

  it('sets no owner (the Note module has no owner field)', () => {
    const raw = makeRaw({ values: [{ name: 'OwnerId', value: 'usr-9' }] })
    expect(transformNote(raw).owner_id).toBeUndefined()
  })

  it('preserves raw as metadata', () => {
    expect(transformNote(doc).metadata).toBe(doc)
  })
})

describe('corteza-crm untransformNote', () => {
  it('maps content → Note field', () => {
    const values = untransformNote({ content: 'Follow up' })
    expect(values.find((v) => v.name === 'Note')?.value).toBe('Follow up')
  })

  it('maps contact_id → ContactId field', () => {
    const values = untransformNote({ content: 'x', contact_id: 'cont-1' })
    expect(values.find((v) => v.name === 'ContactId')?.value).toBe('cont-1')
  })

  it('maps company_id → AccountId field', () => {
    const values = untransformNote({ content: 'x', company_id: 'acc-2' })
    expect(values.find((v) => v.name === 'AccountId')?.value).toBe('acc-2')
  })
})
