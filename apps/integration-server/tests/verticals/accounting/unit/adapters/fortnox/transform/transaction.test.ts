import { describe, it, expect } from 'vitest'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'
import {
  transformTransaction,
  type FortnoxPayment,
} from '../../../../../../../src/verticals/accounting/adapters/fortnox/transform/transaction'

function makePayment(overrides: Partial<FortnoxPayment> = {}): FortnoxPayment {
  return {
    Number: '42',
    InvoiceNumber: '100',
    Amount: 12500,
    AmountCurrency: 12500,
    Currency: 'SEK',
    PaymentDate: '2024-03-15',
    Source: 'MANUAL',
    AccountNumber: '1920',
    WriteOffs: [],
    CustomerNumber: 'CUST001',
    CustomerName: 'Acme AB',
    ...overrides,
  }
}

describe('transformTransaction', () => {
  it('maps Number to id', () => {
    expect(transformTransaction(makePayment()).id).toBe('42')
  })

  it('maps InvoiceNumber to reference', () => {
    expect(transformTransaction(makePayment()).reference).toBe('100')
  })

  it('maps Amount to totalAmount', () => {
    expect(transformTransaction(makePayment()).totalAmount).toBe(1250000)
  })

  it('maps Currency to currency', () => {
    expect(transformTransaction(makePayment()).currency).toBe('SEK')
  })

  it('maps Source to type', () => {
    expect(transformTransaction(makePayment()).type).toBe('MANUAL')
  })

  it('maps AccountNumber to accountId', () => {
    expect(transformTransaction(makePayment()).accountId).toBe('1920')
  })

  it('maps PaymentDate to createdAt as Date', () => {
    const result = transformTransaction(makePayment())
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.createdAt?.toISOString().startsWith('2024-03-15')).toBe(true)
  })

  it('returns undefined createdAt when PaymentDate is empty', () => {
    expect(transformTransaction(makePayment({ PaymentDate: '' })).createdAt).toBeUndefined()
  })

  it('maps CustomerNumber and CustomerName to contacts', () => {
    const result = transformTransaction(makePayment())
    expect(result.contacts).toHaveLength(1)
    expect(result.contacts![0].id).toBe('CUST001')
    expect(result.contacts![0].name).toBe('Acme AB')
  })

  it('includes write-off amounts in lineItems', () => {
    const raw = makePayment({
      WriteOffs: [{ WriteOffAmount: 500, AccountNumber: '3740', Description: 'Rounding' }],
    })
    const result = transformTransaction(raw)
    expect(result.lineItems).toHaveLength(2)
    expect(result.lineItems![1].totalAmount).toBe(50000)
    expect(result.lineItems![1].accountId).toBe('3740')
  })

  it('passes raw object as metadata', () => {
    const raw = makePayment()
    expect(transformTransaction(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformTransaction(makePayment())
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })
})
