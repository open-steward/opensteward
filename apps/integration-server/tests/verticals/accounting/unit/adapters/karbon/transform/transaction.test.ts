import { describe, it, expect } from 'vitest'
import {
  transformPayment,
  type KarbonPayment,
} from '../../../../../../../src/verticals/accounting/adapters/karbon/transform/transaction'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'

function makePayment(overrides: Partial<KarbonPayment> = {}): KarbonPayment {
  return {
    PaymentKey: 'pay-001',
    InvoiceKey: 'inv-001',
    PaymentReference: 'REF-2024-001',
    PaymentType: 'PAYMENT',
    PaymentDate: '2024-02-20T14:00:00.000Z',
    GrossAmount: 12000,
    PaymentMethod: 'ACH',
    Client: {
      ClientKey: 'client-001',
      ClientType: 'Contact',
      Name: 'Jane Doe',
    },
    ...overrides,
  }
}

describe('transformPayment', () => {
  it('maps PaymentKey to id', () => {
    expect(transformPayment(makePayment()).id).toBe('pay-001')
  })

  it('maps PaymentType to type', () => {
    expect(transformPayment(makePayment()).type).toBe('PAYMENT')
  })

  it('maps InvoiceKey to reference', () => {
    expect(transformPayment(makePayment()).reference).toBe('inv-001')
  })

  it('maps PaymentReference to memo', () => {
    expect(transformPayment(makePayment()).memo).toBe('REF-2024-001')
  })

  it('maps PaymentMethod to paymentMethod', () => {
    expect(transformPayment(makePayment()).paymentMethod).toBe('ACH')
  })

  it('maps GrossAmount to totalAmount', () => {
    expect(transformPayment(makePayment()).totalAmount).toBe(12000)
  })

  it('maps Client.ClientKey and Client.Name to contacts', () => {
    const result = transformPayment(makePayment())
    expect(result.contacts).toHaveLength(1)
    expect(result.contacts?.[0]).toEqual({ id: 'client-001', name: 'Jane Doe' })
  })

  it('sets contacts to undefined when Client is null', () => {
    const result = transformPayment(makePayment({ Client: null }))
    expect(result.contacts).toBeUndefined()
  })

  it('sets contacts to undefined when Client has no ClientKey', () => {
    const result = transformPayment(
      makePayment({ Client: { ClientType: 'Contact', Name: 'Jane' } }),
    )
    expect(result.contacts).toBeUndefined()
  })

  it('omits name from contact entry when Client.Name is absent', () => {
    const result = transformPayment(
      makePayment({
        Client: { ClientKey: 'client-002', Name: undefined },
      }),
    )
    expect(result.contacts?.[0]).toEqual({ id: 'client-002', name: undefined })
  })

  it('parses PaymentDate to a Date for createdAt', () => {
    const result = transformPayment(makePayment())
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.createdAt?.toISOString()).toBe('2024-02-20T14:00:00.000Z')
  })

  it('sets createdAt to undefined when PaymentDate is absent', () => {
    const result = transformPayment(makePayment({ PaymentDate: undefined }))
    expect(result.createdAt).toBeUndefined()
  })

  it('does not set updatedAt (Karbon payments have no updatedAt field)', () => {
    expect(transformPayment(makePayment()).updatedAt).toBeUndefined()
  })

  it('passes the raw object as metadata', () => {
    const raw = makePayment()
    expect(transformPayment(raw).metadata).toBe(raw)
  })

  it('sets type to undefined when PaymentType is absent', () => {
    const result = transformPayment(makePayment({ PaymentType: undefined }))
    expect(result.type).toBeUndefined()
  })

  it('sets reference to undefined when InvoiceKey is absent', () => {
    const result = transformPayment(makePayment({ InvoiceKey: undefined }))
    expect(result.reference).toBeUndefined()
  })

  it('sets totalAmount to undefined when GrossAmount is absent', () => {
    const result = transformPayment(makePayment({ GrossAmount: undefined }))
    expect(result.totalAmount).toBeUndefined()
  })

  it('produces a schema-valid result', () => {
    expect(() => TransactionSchema.parse(transformPayment(makePayment()))).not.toThrow()
  })

  it('produces a schema-valid result with minimal input', () => {
    const minimal: KarbonPayment = { PaymentKey: 'pay-min' }
    expect(() => TransactionSchema.parse(transformPayment(minimal))).not.toThrow()
  })
})
