import { describe, it, expect } from 'vitest'
import { JournalSchema } from '../../../../../../../src/verticals/accounting/schema/journal'
import { transformJournal, type KoraStubJournal } from '../../../../../../../src/verticals/accounting/adapters/kora/transform/journal'

function makeRaw(overrides: KoraStubJournal = {}): KoraStubJournal {
  return { ...overrides }
}

describe('kora transformJournal', () => {
  it('handles empty object gracefully', () => {
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
