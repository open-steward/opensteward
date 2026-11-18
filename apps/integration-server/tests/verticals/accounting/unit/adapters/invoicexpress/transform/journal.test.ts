import { describe, it, expect } from 'vitest'
import { JournalSchema } from '../../../../../../../src/verticals/accounting/schema/journal'
import { transformJournal, type InvoiceXpressJournal } from '../../../../../../../src/verticals/accounting/adapters/invoicexpress/transform/journal'

function makeJournal(overrides: Partial<InvoiceXpressJournal> = {}): InvoiceXpressJournal {
  return {
    id: 30,
    date: '2024-04-15',
    description: 'Year-end adjustment',
    currency: 'EUR',
    lines: [],
    ...overrides,
  }
}

describe('transformJournal', () => {
  it('maps core fields correctly', () => {
    const result = transformJournal(makeJournal())
    expect(result.id).toBe('30')
    expect(result.description).toBe('Year-end adjustment')
    expect(result.currency).toBe('EUR')
  })

  it('parses date as Date object', () => {
    const result = transformJournal(makeJournal())
    expect(result.postedAt).toEqual(new Date('2024-04-15'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeJournal({ description: 'Test entry' })
    const result = transformJournal(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps journal lines to lineItems', () => {
    const raw = makeJournal({
      lines: [
        { account_id: 1001, description: 'Sales', debit: 0, credit: 1000 },
        { account_id: 1002, description: 'Cash', debit: 1000, credit: 0 },
      ],
    })
    const result = transformJournal(raw)
    expect(result.lineItems).toHaveLength(2)
    expect(result.lineItems![0].accountId).toBe('1001')
    expect(result.lineItems![0].description).toBe('Sales')
    expect(result.lineItems![0].creditAmount).toBe(1000)
    expect(result.lineItems![1].debitAmount).toBe(1000)
  })

  it('returns undefined postedAt when date is empty', () => {
    const result = transformJournal(makeJournal({ date: '' }))
    expect(result.postedAt).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformJournal(makeJournal())
    expect(() => JournalSchema.parse(result)).not.toThrow()
  })
})
