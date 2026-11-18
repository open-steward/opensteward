import { describe, it, expect } from 'vitest'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'
import {
  transformNote,
  type RawChurnZeroNote,
} from '../../../../../../../src/verticals/crm/adapters/churnzero/transform/note'

function makeRaw(overrides: Partial<RawChurnZeroNote> = {}): RawChurnZeroNote {
  return { id: 'N1', ...overrides }
}

describe('churnzero transformNote', () => {
  it('maps numeric id to string', () => {
    expect(transformNote(makeRaw({ id: 42 })).id).toBe('42')
  })

  it('maps string id to string', () => {
    expect(transformNote(makeRaw({ id: 'NOTE-7' })).id).toBe('NOTE-7')
  })

  it('maps content when present', () => {
    expect(transformNote(makeRaw({ content: 'Important note' })).content).toBe('Important note')
  })

  it('defaults content to empty string when absent', () => {
    expect(transformNote(makeRaw()).content).toBe('')
  })

  it('maps numeric accountId to company_id string', () => {
    expect(transformNote(makeRaw({ accountId: 5 })).company_id).toBe('5')
  })

  it('maps string accountId to company_id', () => {
    expect(transformNote(makeRaw({ accountId: 'ACC-3' })).company_id).toBe('ACC-3')
  })

  it('omits company_id when accountId is absent', () => {
    expect(transformNote(makeRaw()).company_id).toBeUndefined()
  })

  it('maps numeric contactId to contact_id string', () => {
    expect(transformNote(makeRaw({ contactId: 12 })).contact_id).toBe('12')
  })

  it('maps string contactId to contact_id', () => {
    expect(transformNote(makeRaw({ contactId: 'CON-2' })).contact_id).toBe('CON-2')
  })

  it('omits contact_id when contactId is absent', () => {
    expect(transformNote(makeRaw()).contact_id).toBeUndefined()
  })

  it('maps createdAt to created_at', () => {
    expect(transformNote(makeRaw({ createdAt: '2024-01-10T00:00:00Z' })).created_at).toBe('2024-01-10T00:00:00Z')
  })

  it('maps updatedAt to updated_at', () => {
    expect(transformNote(makeRaw({ updatedAt: '2024-08-01T00:00:00Z' })).updated_at).toBe('2024-08-01T00:00:00Z')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformNote(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformNote(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformNote(makeRaw({ id: 42 }))
    expect(() => NoteSchema.parse(result)).not.toThrow()
  })
})
