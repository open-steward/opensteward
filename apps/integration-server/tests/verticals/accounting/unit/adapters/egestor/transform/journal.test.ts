import { describe, it, expect } from 'vitest'
import {
  transformJournal,
  type EgestorJournalStub,
} from '../../../../../../../src/verticals/accounting/adapters/egestor/transform/journal'
import { JournalSchema } from '../../../../../../../src/verticals/accounting/schema/journal'

describe('egestor transformJournal (stub)', () => {
  it('returns metadata equal to raw input', () => {
    const raw: EgestorJournalStub = { foo: 'bar' }
    const result = transformJournal(raw)
    expect(result.metadata).toBe(raw)
  })

  it('returns object with only metadata key', () => {
    const result = transformJournal({})
    // Stub only sets metadata — all other fields are absent
    expect(Object.keys(result)).toEqual(['metadata'])
  })

  it('passes JournalSchema.parse without throwing', () => {
    const result = transformJournal({})
    expect(() => JournalSchema.parse(result)).not.toThrow()
  })
})
