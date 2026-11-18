import { describe, it, expect } from 'vitest'
import { JournalSchema } from '../../../../../../../src/verticals/accounting/schema/journal'
import { transformJournal, type KwaraJournal } from '../../../../../../../src/verticals/accounting/adapters/kwara/transform/journal'

function makeRaw(overrides: Partial<KwaraJournal> = {}): KwaraJournal {
  return { id: 'jnl-001', ...overrides }
}

describe('transformJournal (Kwara)', () => {
  it('maps core fields correctly', () => {
    const r = transformJournal(makeRaw())
    expect(r.id).toBe('jnl-001')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    expect(transformJournal(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformJournal(makeRaw())
    expect(() => JournalSchema.parse(result)).not.toThrow()
  })
})
