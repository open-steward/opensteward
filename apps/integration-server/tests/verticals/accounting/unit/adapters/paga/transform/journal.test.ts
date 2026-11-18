import { describe, it, expect } from 'vitest'
import { JournalSchema } from '../../../../../../../src/verticals/accounting/schema/journal'
import { transformJournal, type PagaStubJournal } from '../../../../../../../src/verticals/accounting/adapters/paga/transform/journal'

function makeRaw(overrides: Partial<PagaStubJournal> = {}): PagaStubJournal {
  return { ...overrides }
}

describe('paga transformJournal', () => {
  it('handles missing optional fields gracefully', () => {
    expect(() => transformJournal(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformJournal(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformJournal(makeRaw())
    expect(() => JournalSchema.parse(result)).not.toThrow()
  })
})
