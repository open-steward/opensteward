import { describe, it, expect } from 'vitest'
import { transformBill } from '../../../../../../../src/verticals/accounting/adapters/billit/transform/bill'
import type { BillitOrder } from '../../../../../../../src/verticals/accounting/adapters/billit/transform/invoice'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'

function makeOrder(overrides: Partial<BillitOrder> = {}): BillitOrder {
  return {
    OrderID: 42,
    OrderNumber: 'BILL-042',
    OrderStatus: 'ToPay',
    Paid: false,
    Currency: 'EUR',
    TotalIncl: 12100,
    TotalVAT: 1100,
    ToPay: 12100,
    OrderDate: '2024-01-15',
    ExpiryDate: '2024-02-15',
    CounterParty: { PartyID: 'sup-1', Name: 'ACME Supplier' },
    ...overrides,
  }
}

describe('transformBill', () => {
  it('maps OrderID to id as string', () => {
    expect(transformBill(makeOrder()).id).toBe('42')
  })

  it('maps OrderNumber to billNumber', () => {
    expect(transformBill(makeOrder()).billNumber).toBe('BILL-042')
  })

  it('maps CounterParty.PartyID to contactId', () => {
    expect(transformBill(makeOrder()).contactId).toBe('sup-1')
  })

  it('falls back to Supplier.Nr when no CounterParty', () => {
    const raw = makeOrder({
      CounterParty: undefined,
      Supplier: { Nr: 'sup-nr-1', Name: 'Fallback Supplier' },
    })
    expect(transformBill(raw).contactId).toBe('sup-nr-1')
  })

  it('maps ToPay status to AUTHORIZED when ToPay equals TotalIncl', () => {
    expect(
      transformBill(makeOrder({ OrderStatus: 'ToPay', ToPay: 12100, TotalIncl: 12100 })).status,
    ).toBe('AUTHORIZED')
  })

  it('maps ToPay status to PARTIALLY_PAID when ToPay < TotalIncl', () => {
    const raw = makeOrder({ OrderStatus: 'ToPay', ToPay: 5000, TotalIncl: 12100 })
    expect(transformBill(raw).status).toBe('PARTIALLY_PAID')
  })

  it('maps Paid status to PAID', () => {
    expect(transformBill(makeOrder({ OrderStatus: 'Paid' })).status).toBe('PAID')
  })

  it('maps Paid=true boolean to PAID regardless of OrderStatus', () => {
    expect(transformBill(makeOrder({ OrderStatus: 'ToPay', Paid: true })).status).toBe('PAID')
  })

  it('maps Canceled status to VOIDED', () => {
    expect(transformBill(makeOrder({ OrderStatus: 'Canceled' })).status).toBe('VOIDED')
  })

  it('maps credited status to VOIDED', () => {
    expect(transformBill(makeOrder({ OrderStatus: 'Credited' })).status).toBe('VOIDED')
  })

  it('maps submitted status to SUBMITTED', () => {
    expect(transformBill(makeOrder({ OrderStatus: 'Submitted' })).status).toBe('SUBMITTED')
  })

  it('maps Draft status to DRAFT', () => {
    expect(transformBill(makeOrder({ OrderStatus: 'Draft' })).status).toBe('DRAFT')
  })

  it('computes paidAmount as TotalIncl - ToPay when partially paid', () => {
    const raw = makeOrder({ TotalIncl: 12100, ToPay: 5000, OrderStatus: 'ToPay' })
    expect(transformBill(raw).paidAmount).toBe(7100)
  })

  it('computes paidAmount as TotalIncl when fully paid', () => {
    const raw = makeOrder({ TotalIncl: 12100, ToPay: 0, Paid: true })
    expect(transformBill(raw).paidAmount).toBe(12100)
  })

  it('parses dates as Date objects', () => {
    const result = transformBill(makeOrder())
    expect(result.postedAt).toEqual(new Date('2024-01-15'))
    expect(result.dueAt).toEqual(new Date('2024-02-15'))
  })

  it('passes schema validation', () => {
    expect(() => BillSchema.parse(transformBill(makeOrder()))).not.toThrow()
  })

  it('passes raw object as metadata', () => {
    const raw = makeOrder()
    expect(transformBill(raw).metadata).toBe(raw)
  })
})
