import { describe, it, expect } from 'vitest'
import {
  transformJournal,
  type ReckonOneJournalEntry,
} from '../../../../../../../src/verticals/accounting/adapters/reckon-one/transform/journal'
import { JournalSchema } from '../../../../../../../src/verticals/accounting/schema/journal'

function makeJournal(overrides: Partial<ReckonOneJournalEntry> = {}): ReckonOneJournalEntry {
  return {
    id: 'jnl_001',
    date: '2024-04-30',
    reference: 'JNL-APR-001',
    description: 'Month-end accrual',
    currency: 'AUD',
    lines: [
      {
        id: 'jl_001',
        account: { id: 'acct_exp', name: 'Expense Account' },
        contact: { id: 'cont_001', name: 'Vendor' },
        description: 'Accrued expense',
        debitAmount: 5000.0,
        creditAmount: undefined,
        taxAmount: 500.0,
      },
      {
        id: 'jl_002',
        account: { id: 'acct_payable', name: 'Accounts Payable' },
        description: 'Accrual liability',
        debitAmount: undefined,
        creditAmount: 5000.0,
      },
    ],
    createdDateTime: '2024-04-30T17:00:00Z',
    modifiedDateTime: '2024-05-01T09:00:00Z',
    ...overrides,
  }
}

describe('transformJournal', () => {
  it('maps id', () => {
    expect(transformJournal(makeJournal()).id).toBe('jnl_001')
  })

  it('maps description', () => {
    expect(transformJournal(makeJournal()).description).toBe('Month-end accrual')
  })

  it('maps reference', () => {
    expect(transformJournal(makeJournal()).reference).toBe('JNL-APR-001')
  })

  it('maps currency', () => {
    expect(transformJournal(makeJournal()).currency).toBe('AUD')
  })

  it('maps date to postedAt as Date', () => {
    expect(transformJournal(makeJournal()).postedAt).toEqual(new Date('2024-04-30'))
  })

  it('maps createdDateTime to createdAt', () => {
    expect(transformJournal(makeJournal()).createdAt).toEqual(new Date('2024-04-30T17:00:00Z'))
  })

  it('maps account.id to lineitem accountId', () => {
    expect(transformJournal(makeJournal()).lineItems?.[0].accountId).toBe('acct_exp')
  })

  it('maps contact.id to lineitem contactId', () => {
    expect(transformJournal(makeJournal()).lineItems?.[0].contactId).toBe('cont_001')
  })

  it('converts debitAmount to minor units', () => {
    expect(transformJournal(makeJournal()).lineItems?.[0].debitAmount).toBe(500000)
  })

  it('converts creditAmount to minor units', () => {
    expect(transformJournal(makeJournal()).lineItems?.[1].creditAmount).toBe(500000)
  })

  it('converts taxAmount to minor units', () => {
    expect(transformJournal(makeJournal()).lineItems?.[0].taxAmount).toBe(50000)
  })

  it('creditAmount is undefined for debit-only line', () => {
    expect(transformJournal(makeJournal()).lineItems?.[0].creditAmount).toBeUndefined()
  })

  it('passes raw object as metadata', () => {
    const raw = makeJournal()
    expect(transformJournal(raw).metadata).toBe(raw)
  })

  it('produces output that passes JournalSchema validation', () => {
    expect(() => JournalSchema.parse(transformJournal(makeJournal()))).not.toThrow()
  })

  it('produces schema-valid output when optional fields are absent', () => {
    const result = transformJournal({ id: 'jnl_001' })
    expect(() => JournalSchema.parse(result)).not.toThrow()
  })
})
