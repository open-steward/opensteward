import { describe, it, expect } from 'vitest'
import { JournalSchema } from '../../../../../../../src/verticals/accounting/schema/journal'
import { transformJournal, type XeroJournal } from '../../../../../../../src/verticals/accounting/adapters/xero/transform/journal'

function makeJournal(overrides: Partial<XeroJournal> = {}): XeroJournal {
  return {
    JournalID: 'jnl-001',
    JournalDate: '2024-03-31',
    JournalNumber: 42,
    Reference: 'ACCRUAL-Q1',
    CreatedDateUTC: '2024-04-01T00:00:00Z',
    JournalLines: [
      {
        JournalLineID: 'jll-1',
        AccountID: 'acct-100',
        AccountCode: '100',
        AccountType: 'CURRENT',
        Description: 'Revenue',
        GrossAmount: 5000,
        NetAmount: 5000,
        TaxAmount: 0,
      },
      {
        JournalLineID: 'jll-2',
        AccountID: 'acct-200',
        AccountCode: '200',
        AccountType: 'CURRLIAB',
        Description: 'VAT payable',
        GrossAmount: -5000,
        NetAmount: -5000,
        TaxAmount: 0,
      },
    ],
    ...overrides,
  }
}

describe('transformJournal (Xero)', () => {
  it('maps core fields correctly', () => {
    const result = transformJournal(makeJournal())
    expect(result.id).toBe('jnl-001')
    expect(result.reference).toBe('ACCRUAL-Q1')
  })

  it('emits JournalDate as a calendar date', () => {
    expect(transformJournal(makeJournal()).postedAt).toBe('2024-03-31')
  })

  it('parses CreatedDateUTC as createdAt', () => {
    expect(transformJournal(makeJournal()).createdAt).toEqual(new Date('2024-04-01T00:00:00Z'))
  })

  it('maps positive GrossAmount as debitAmount', () => {
    const result = transformJournal(makeJournal())
    const line = result.lineItems![0]
    expect(line.debitAmount).toBe(500000)
    expect(line.creditAmount).toBeUndefined()
  })

  it('maps negative GrossAmount as creditAmount (absolute value)', () => {
    const result = transformJournal(makeJournal())
    const line = result.lineItems![1]
    expect(line.creditAmount).toBe(500000)
    expect(line.debitAmount).toBeUndefined()
  })

  it('maps journal line fields', () => {
    const result = transformJournal(makeJournal())
    const line = result.lineItems![0]
    expect(line.id).toBe('jll-1')
    expect(line.accountId).toBe('acct-100')
    expect(line.description).toBe('Revenue')
  })

  it('handles empty JournalLines', () => {
    const result = transformJournal(makeJournal({ JournalLines: [] }))
    expect(result.lineItems).toHaveLength(0)
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeJournal()
    expect(transformJournal(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformJournal(makeJournal())
    expect(() => JournalSchema.parse(result)).not.toThrow()
  })
})
