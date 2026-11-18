import { describe, it, expect } from 'vitest'
import { JournalSchema } from '../../../../../../../src/verticals/accounting/schema/journal'
import {
  transformJournal,
  type GiddhJournalVoucher,
} from '../../../../../../../src/verticals/accounting/adapters/giddh/transform/journal'

function makeRaw(overrides: Partial<GiddhJournalVoucher> = {}): GiddhJournalVoucher {
  return {
    uniqueName: 'journal-001',
    number: 'JV-2024-001',
    voucherDate: '2024-03-15',
    description: 'Adjustment entry',
    entries: [],
    ...overrides,
  }
}

describe('transformJournal (giddh)', () => {
  it('maps core fields correctly', () => {
    const result = transformJournal(makeRaw())
    expect(result.id).toBe('journal-001')
    expect(result.reference).toBe('JV-2024-001')
    expect(result.description).toBe('Adjustment entry')
  })

  it('parses voucherDate as Date object', () => {
    const result = transformJournal(makeRaw())
    expect(result.postedAt).toEqual(new Date('2024-03-15'))
  })

  it('maps DEBIT entries correctly', () => {
    const raw = makeRaw({
      entries: [
        {
          uniqueName: 'entry-001',
          particular: { uniqueName: 'cash-in-hand', name: 'Cash' },
          debit: 10000,
          credit: 0,
          amount: 10000,
          type: 'DEBIT',
        },
      ],
    })
    const result = transformJournal(raw)
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].accountId).toBe('cash-in-hand')
    expect(result.lineItems![0].debitAmount).toBe(10000)
    expect(result.lineItems![0].creditAmount).toBeUndefined()
  })

  it('maps CREDIT entries correctly', () => {
    const raw = makeRaw({
      entries: [
        {
          uniqueName: 'entry-002',
          particular: { uniqueName: 'sales-account', name: 'Sales' },
          debit: 0,
          credit: 10000,
          amount: 10000,
          type: 'CREDIT',
        },
      ],
    })
    const result = transformJournal(raw)
    expect(result.lineItems![0].creditAmount).toBe(10000)
    expect(result.lineItems![0].debitAmount).toBeUndefined()
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    const result = transformJournal(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformJournal(makeRaw())
    expect(() => JournalSchema.parse(result)).not.toThrow()
  })
})
