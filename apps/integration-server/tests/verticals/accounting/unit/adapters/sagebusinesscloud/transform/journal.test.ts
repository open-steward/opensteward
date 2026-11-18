import { describe, it, expect } from 'vitest'
import { JournalSchema } from '../../../../../../../src/verticals/accounting/schema/journal'
import { transformJournal, type SageJournal } from '../../../../../../../src/verticals/accounting/adapters/sagebusinesscloud/transform/journal'

function makeRaw(overrides: Partial<SageJournal> = {}): SageJournal {
  return {
    id: 'jnl-001',
    reference: 'JNL-2024-001',
    date: '2024-01-31',
    journal_lines: [
      { id: 'line-1', ledger_account: { id: 'acct-001' }, description: 'Debit entry', debit: 1000 },
      { id: 'line-2', ledger_account: { id: 'acct-002' }, description: 'Credit entry', credit: 1000 },
    ],
    ...overrides,
  }
}

describe('transformJournal (SageBusinessCloud)', () => {
  it('maps core fields correctly', () => {
    const result = transformJournal(makeRaw())
    expect(result.id).toBe('jnl-001')
    expect(result.reference).toBe('JNL-2024-001')
  })

  it('parses date as Date object', () => {
    const result = transformJournal(makeRaw())
    expect(result.postedAt).toEqual(new Date('2024-01-31'))
  })

  it('maps journal lines', () => {
    const result = transformJournal(makeRaw())
    expect(result.lineItems).toHaveLength(2)
    expect(result.lineItems?.[0].accountId).toBe('acct-001')
    expect(result.lineItems?.[0].debitAmount).toBe(1000)
    expect(result.lineItems?.[1].accountId).toBe('acct-002')
    expect(result.lineItems?.[1].creditAmount).toBe(1000)
  })

  it('sets metadata to raw object', () => {
    const raw = makeRaw()
    expect(transformJournal(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformJournal(makeRaw())
    expect(() => JournalSchema.parse(result)).not.toThrow()
  })
})
