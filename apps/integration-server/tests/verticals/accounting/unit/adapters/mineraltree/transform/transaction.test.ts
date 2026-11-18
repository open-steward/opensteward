import { describe, it, expect } from 'vitest'
import {
  transformTransaction,
  type MtPayment,
} from '../../../../../../../src/verticals/accounting/adapters/mineraltree/transform/transaction'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'

function makePayment(overrides: Partial<MtPayment> = {}): MtPayment {
  return {
    id: 'mt_pay_001',
    externalId: 'EXT-PAY-1',
    vendor: { id: 'vnd_10', name: 'Parts Co' },
    amount: { amount: 1250.0, currency: 'USD' },
    transactionDate: '2024-03-20',
    checkNumber: 'CHK-1001',
    fundMethod: { type: 'CHECK' },
    bills: [
      { id: 'mt_bill_001', appliedPaymentAmount: { amount: 750.0, currency: 'USD' } },
      { id: 'mt_bill_002', appliedPaymentAmount: { amount: 500.0, currency: 'USD' } },
    ],
    ...overrides,
  }
}

describe('transformTransaction (mineraltree)', () => {
  it('maps id', () => {
    expect(transformTransaction(makePayment()).id).toBe('mt_pay_001')
  })

  it('maps fundMethod.type to type', () => {
    expect(transformTransaction(makePayment()).type).toBe('CHECK')
  })

  it('maps checkNumber to reference', () => {
    expect(transformTransaction(makePayment()).reference).toBe('CHK-1001')
  })

  it('falls back to sequenceText for reference when checkNumber is absent', () => {
    const result = transformTransaction(
      makePayment({ checkNumber: undefined, sequenceText: 'SEQ-42' }),
    )
    expect(result.reference).toBe('SEQ-42')
  })

  it('maps fundMethod.type to paymentMethod', () => {
    expect(transformTransaction(makePayment()).paymentMethod).toBe('CHECK')
  })

  it('maps currency from amount.currency', () => {
    expect(transformTransaction(makePayment()).currency).toBe('USD')
  })

  it('converts decimal amount to integer minor units via toMinorUnits', () => {
    // 1250.00 * 100 = 125000
    expect(transformTransaction(makePayment()).totalAmount).toBe(125000)
  })

  it('maps vendor to contacts', () => {
    const result = transformTransaction(makePayment())
    expect(result.contacts).toHaveLength(1)
    expect(result.contacts![0].id).toBe('vnd_10')
    expect(result.contacts![0].name).toBe('Parts Co')
  })

  it('returns no contacts when vendor is absent', () => {
    const result = transformTransaction(makePayment({ vendor: undefined }))
    expect(result.contacts).toBeUndefined()
  })

  it('maps transactionDate to createdAt', () => {
    expect(transformTransaction(makePayment()).createdAt).toEqual(new Date('2024-03-20'))
  })

  it('maps bills to lineItems', () => {
    const result = transformTransaction(makePayment())
    expect(result.lineItems).toHaveLength(2)
    expect(result.lineItems![0].id).toBe('mt_bill_001')
    expect(result.lineItems![0].totalAmount).toBe(75000) // 750 * 100
    expect(result.lineItems![1].id).toBe('mt_bill_002')
    expect(result.lineItems![1].totalAmount).toBe(50000) // 500 * 100
  })

  it('returns no lineItems when bills array is empty', () => {
    const result = transformTransaction(makePayment({ bills: [] }))
    expect(result.lineItems).toBeUndefined()
  })

  it('passes raw object as metadata', () => {
    const raw = makePayment()
    expect(transformTransaction(raw).metadata).toBe(raw)
  })

  it('passes TransactionSchema validation', () => {
    expect(() => TransactionSchema.parse(transformTransaction(makePayment()))).not.toThrow()
  })
})
