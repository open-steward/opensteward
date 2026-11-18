import { describe, it, expect } from 'vitest'
import {
  transformTransaction,
  type ReckonOnePayment,
} from '../../../../../../../src/verticals/accounting/adapters/reckon-one/transform/transaction'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'

function makePayment(overrides: Partial<ReckonOnePayment> = {}): ReckonOnePayment {
  return {
    id: 'pay_001',
    date: '2024-04-15',
    amount: 1100.0,
    currency: 'AUD',
    account: { id: 'acct_bank', name: 'Cheque Account' },
    customer: { id: 'cust_001', name: 'Widget Co' },
    supplier: { id: 'supp_001', name: 'Parts Supplier' },
    paymentMethod: 'CHEQUE',
    reference: 'REF-2024-001',
    memo: 'Invoice settlement',
    createdDateTime: '2024-04-15T10:00:00Z',
    modifiedDateTime: '2024-04-15T11:00:00Z',
    ...overrides,
  }
}

describe('transformTransaction', () => {
  it('maps id', () => {
    expect(transformTransaction(makePayment()).id).toBe('pay_001')
  })

  it('maps account.id to accountId', () => {
    expect(transformTransaction(makePayment()).accountId).toBe('acct_bank')
  })

  it('maps currency', () => {
    expect(transformTransaction(makePayment()).currency).toBe('AUD')
  })

  it('maps paymentMethod', () => {
    expect(transformTransaction(makePayment()).paymentMethod).toBe('CHEQUE')
  })

  it('maps reference', () => {
    expect(transformTransaction(makePayment()).reference).toBe('REF-2024-001')
  })

  it('maps memo', () => {
    expect(transformTransaction(makePayment()).memo).toBe('Invoice settlement')
  })

  it('converts amount decimal to totalAmount in minor units', () => {
    expect(transformTransaction(makePayment()).totalAmount).toBe(110000)
  })

  it('maps date to createdAt as Date', () => {
    expect(transformTransaction(makePayment()).createdAt).toEqual(new Date('2024-04-15'))
  })

  it('maps modifiedDateTime to updatedAt', () => {
    expect(transformTransaction(makePayment()).updatedAt).toEqual(new Date('2024-04-15T11:00:00Z'))
  })

  it('includes both customer and supplier in contacts', () => {
    const result = transformTransaction(makePayment())
    const ids = result.contacts?.map((c) => c.id)
    expect(ids).toContain('cust_001')
    expect(ids).toContain('supp_001')
  })

  it('contacts has only customer when supplier is absent', () => {
    const result = transformTransaction(makePayment({ supplier: undefined }))
    expect(result.contacts).toHaveLength(1)
    expect(result.contacts?.[0].id).toBe('cust_001')
  })

  it('contacts is undefined when neither customer nor supplier is present', () => {
    const result = transformTransaction(makePayment({ customer: undefined, supplier: undefined }))
    expect(result.contacts).toBeUndefined()
  })

  it('passes raw object as metadata', () => {
    const raw = makePayment()
    expect(transformTransaction(raw).metadata).toBe(raw)
  })

  it('produces output that passes TransactionSchema validation', () => {
    expect(() => TransactionSchema.parse(transformTransaction(makePayment()))).not.toThrow()
  })

  it('produces schema-valid output when optional fields are absent', () => {
    const result = transformTransaction({ id: 'pay_001' })
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })
})
