import { describe, it, expect } from 'vitest'
import {
  transformJournal,
  untransformJournal,
  type RealBooksAccountVoucher,
} from '../../../../../../../src/verticals/accounting/adapters/realbooks/transform/journal'
import { JournalSchema } from '../../../../../../../src/verticals/accounting/schema/journal'

function makeVoucher(overrides: Partial<RealBooksAccountVoucher> = {}): RealBooksAccountVoucher {
  return {
    id: 301,
    transactionNumber: 'JNL-2024-001',
    transactionDate: '20-04-2024',
    transactionDescription: 'Month-end adjustment',
    transactionType: 'Journal',
    txnCode: 'JNL',
    ledgerDetails: [
      { ledger: { id: 10, ledgerName: 'Sales Account' }, amountType: 'cr', amount: 5000.0 },
      { ledger: 'Suspense Account', amountType: 'dr', amount: 5000.0 },
    ],
    ...overrides,
  }
}

describe('transformJournal', () => {
  it('maps id as string', () => {
    expect(transformJournal(makeVoucher()).id).toBe('301')
  })

  it('maps transactionNumber to reference', () => {
    expect(transformJournal(makeVoucher()).reference).toBe('JNL-2024-001')
  })

  it('maps transactionDescription to description', () => {
    expect(transformJournal(makeVoucher()).description).toBe('Month-end adjustment')
  })

  it('maps transactionType to source', () => {
    expect(transformJournal(makeVoucher()).source).toBe('Journal')
  })

  it('parses DD-MM-YYYY transactionDate to postedAt', () => {
    expect(transformJournal(makeVoucher()).postedAt).toEqual(new Date('2024-04-20'))
  })

  it('maps ledger object to lineitem accountId', () => {
    const result = transformJournal(makeVoucher())
    expect(result.lineItems?.[0].accountId).toBe('Sales Account')
  })

  it('maps ledger string to lineitem accountId', () => {
    const result = transformJournal(makeVoucher())
    expect(result.lineItems?.[1].accountId).toBe('Suspense Account')
  })

  it('maps cr amountType to creditAmount in minor units', () => {
    const result = transformJournal(makeVoucher())
    expect(result.lineItems?.[0].creditAmount).toBe(500000)
    expect(result.lineItems?.[0].debitAmount).toBeUndefined()
  })

  it('maps dr amountType to debitAmount in minor units', () => {
    const result = transformJournal(makeVoucher())
    expect(result.lineItems?.[1].debitAmount).toBe(500000)
    expect(result.lineItems?.[1].creditAmount).toBeUndefined()
  })

  it('passes raw object as metadata', () => {
    const raw = makeVoucher()
    expect(transformJournal(raw).metadata).toBe(raw)
  })

  it('produces output that passes JournalSchema validation', () => {
    expect(() => JournalSchema.parse(transformJournal(makeVoucher()))).not.toThrow()
  })

  it('produces schema-valid output when optional fields are absent', () => {
    const result = transformJournal({ transactionNumber: 'JNL-001' })
    expect(() => JournalSchema.parse(result)).not.toThrow()
  })
})

describe('untransformJournal', () => {
  it('round-trips reference back to transactionNumber', () => {
    const journal = transformJournal(makeVoucher())
    const raw = untransformJournal(journal)
    expect(raw['transactionNumber']).toBe('JNL-2024-001')
  })

  it('round-trips description back to transactionDescription', () => {
    const journal = transformJournal(makeVoucher())
    const raw = untransformJournal(journal)
    expect(raw['transactionDescription']).toBe('Month-end adjustment')
  })

  it('converts minor unit creditAmount back to major unit amount', () => {
    const journal = transformJournal(makeVoucher())
    const raw = untransformJournal(journal)
    const details = raw['ledgerDetails'] as Array<Record<string, unknown>>
    // First ledger row is cr at 5000.00 → creditAmount=500000; untransform → 5000
    const crRow = details.find((d) => d['amountType'] === 'cr')
    expect(crRow?.['amount']).toBe(5000)
  })
})
