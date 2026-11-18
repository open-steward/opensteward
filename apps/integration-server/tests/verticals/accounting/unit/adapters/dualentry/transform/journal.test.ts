import { describe, it, expect } from 'vitest'
import {
  transformJournal,
  untransformJournal,
  type DualentryJournalEntry,
} from '../../../../../../../src/verticals/accounting/adapters/dualentry/transform/journal'
import { JournalSchema } from '../../../../../../../src/verticals/accounting/schema/journal'

function makeRaw(overrides: Partial<DualentryJournalEntry> = {}): DualentryJournalEntry {
  return {
    id: 200,
    number: 3001,
    date: '2024-04-01',
    transaction_date: '2024-04-01',
    memo: 'Opening balances',
    currency_iso_4217_code: 'EUR',
    amount: '1000.00',
    record_status: 'posted',
    lines: [
      {
        id: 1,
        account_id: 1000,
        account_number: 1000,
        customer_id: 10,
        vendor_id: null,
        description: 'Cash',
        debit: '1000.00',
        credit: null,
      },
    ],
    ...overrides,
  }
}

describe('dualentry transformJournal', () => {
  it('maps id to string', () => {
    const result = transformJournal(makeRaw({ id: 42 }))
    expect(result.id).toBe('42')
  })

  it('maps number to reference (not id)', () => {
    const result = transformJournal(makeRaw({ number: 9999 }))
    expect(result.reference).toBe('9999')
  })

  it('maps memo to description', () => {
    const result = transformJournal(makeRaw({ memo: 'Salary accrual' }))
    expect(result.description).toBe('Salary accrual')
  })

  it('line customer_id → cust_ prefix on contactId', () => {
    const result = transformJournal(makeRaw())
    expect(result.lineItems?.[0]?.contactId).toBe('cust_10')
  })

  it('line vendor_id → vend_ prefix on contactId', () => {
    const result = transformJournal(
      makeRaw({
        lines: [
          {
            id: 2,
            account_id: 2000,
            account_number: 2000,
            customer_id: null,
            vendor_id: 5,
            description: null,
            debit: null,
            credit: '500.00',
          },
        ],
      }),
    )
    expect(result.lineItems?.[0]?.contactId).toBe('vend_5')
  })

  it('debit string → minor units', () => {
    const result = transformJournal(makeRaw())
    expect(result.lineItems?.[0]?.debitAmount).toBe(100000)
  })

  it('maps date to postedAt as Date', () => {
    const result = transformJournal(makeRaw({ date: '2024-04-01' }))
    expect(result.postedAt).toBeInstanceOf(Date)
  })

  it('metadata is the raw object', () => {
    const raw = makeRaw()
    const result = transformJournal(raw)
    expect(result.metadata).toBe(raw)
  })

  it('passes JournalSchema.parse without throwing', () => {
    const result = transformJournal(makeRaw())
    expect(() => JournalSchema.parse(result)).not.toThrow()
  })
})

describe('dualentry untransformJournal', () => {
  it('maps description to memo', () => {
    const result = untransformJournal({ description: 'Adjustment' })
    expect(result.memo).toBe('Adjustment')
  })

  it('cust_ contactId → customer_id numeric', () => {
    const result = untransformJournal({
      lineItems: [
        {
          id: '1',
          accountId: '1000',
          contactId: 'cust_42',
          debitAmount: 500,
          creditAmount: undefined,
        },
      ],
    })
    const lines = result.lines as Array<{
      customer_id: number | undefined
      vendor_id: number | undefined
    }>
    expect(lines[0].customer_id).toBe(42)
    expect(lines[0].vendor_id).toBeUndefined()
  })
})
