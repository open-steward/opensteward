import { describe, it, expect } from 'vitest'
import { JournalSchema } from '../../../../../../../src/verticals/accounting/schema/journal'
import { transformJournal, type SilaStubJournal } from '../../../../../../../src/verticals/accounting/adapters/sila/transform/journal'

function makeRaw(overrides: Partial<SilaStubJournal> = {}): SilaStubJournal {
  return { ...overrides }
}

describe('sila transformJournal', () => {
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
