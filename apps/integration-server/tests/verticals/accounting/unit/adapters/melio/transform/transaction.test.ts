import { describe, it, expect } from 'vitest'
import {
  transformPayment,
  type MelioPayment,
} from '../../../../../../../src/verticals/accounting/adapters/melio/transform/transaction'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'

function makePayment(overrides: Partial<MelioPayment> = {}): MelioPayment {
  return {
    id: 'pay_001',
    billId: 'bill_100',
    vendorId: 'vnd_42',
    amount: 50000, // integer minor units passed through directly
    currency: 'USD',
    paymentMethod: 'ACH',
    scheduledDate: '2024-03-15T00:00:00.000Z',
    ...overrides,
  }
}

describe('transformPayment (melio)', () => {
  it('maps id', () => {
    expect(transformPayment(makePayment()).id).toBe('pay_001')
  })

  it('sets type to PAYMENT', () => {
    expect(transformPayment(makePayment()).type).toBe('PAYMENT')
  })

  it('maps billId to reference', () => {
    expect(transformPayment(makePayment()).reference).toBe('bill_100')
  })

  it('falls back to invoiceId when billId is absent', () => {
    const result = transformPayment(makePayment({ billId: undefined, invoiceId: 'inv_55' }))
    expect(result.reference).toBe('inv_55')
  })

  it('maps vendorId to contacts', () => {
    const result = transformPayment(makePayment())
    expect(result.contacts).toHaveLength(1)
    expect(result.contacts![0].id).toBe('vnd_42')
  })

  it('adds customerId to contacts when present', () => {
    const result = transformPayment(makePayment({ customerId: 'cust_7' }))
    expect(result.contacts).toHaveLength(2)
    expect(result.contacts![1].id).toBe('cust_7')
  })

  it('returns no contacts when neither vendorId nor customerId present', () => {
    const result = transformPayment(makePayment({ vendorId: undefined }))
    // only vendorId absent, no contacts from vendor but no customer either
    expect(result.contacts).toBeUndefined()
  })

  it('maps currency', () => {
    expect(transformPayment(makePayment()).currency).toBe('USD')
  })

  it('maps amount to totalAmount', () => {
    expect(transformPayment(makePayment()).totalAmount).toBe(50000)
  })

  it('maps paymentMethod', () => {
    expect(transformPayment(makePayment()).paymentMethod).toBe('ACH')
  })

  it('maps note to memo', () => {
    const result = transformPayment(makePayment({ note: 'Settlement for Q1' }))
    expect(result.memo).toBe('Settlement for Q1')
  })

  it('passes raw object as metadata', () => {
    const raw = makePayment()
    expect(transformPayment(raw).metadata).toBe(raw)
  })

  it('passes TransactionSchema validation', () => {
    expect(() => TransactionSchema.parse(transformPayment(makePayment()))).not.toThrow()
  })
})
