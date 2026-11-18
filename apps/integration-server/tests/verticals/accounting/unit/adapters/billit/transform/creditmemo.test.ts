import { describe, it, expect } from 'vitest'
import { transformCreditMemo } from '../../../../../../../src/verticals/accounting/adapters/billit/transform/creditmemo'
import type { BillitOrder } from '../../../../../../../src/verticals/accounting/adapters/billit/transform/invoice'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'

function makeOrder(overrides: Partial<BillitOrder> = {}): BillitOrder {
  return {
    OrderID: 77,
    OrderNumber: 'CM-077',
    OrderType: 'CreditNote',
    OrderStatus: 'ToPay',
    Paid: false,
    Currency: 'EUR',
    TotalIncl: 5500,
    TotalVAT: 500,
    ToPay: 5500,
    OrderDate: '2024-04-01',
    ExpiryDate: '2024-04-30',
    CounterParty: { PartyID: 'cust-7', Name: 'Test Customer' },
    ...overrides,
  }
}

describe('transformCreditMemo', () => {
  it('maps OrderID to id as string', () => {
    expect(transformCreditMemo(makeOrder()).id).toBe('77')
  })

  it('maps OrderNumber to creditmemoNumber', () => {
    expect(transformCreditMemo(makeOrder()).creditmemoNumber).toBe('CM-077')
  })

  it('maps CounterParty.PartyID to contactId', () => {
    expect(transformCreditMemo(makeOrder()).contactId).toBe('cust-7')
  })

  it('falls back to Customer.Nr when no CounterParty', () => {
    const raw = makeOrder({
      CounterParty: undefined,
      Customer: { Nr: 'cust-nr-7', Name: 'Fallback' },
    })
    expect(transformCreditMemo(raw).contactId).toBe('cust-nr-7')
  })

  it('maps ToPay status to AUTHORIZED when ToPay equals TotalIncl', () => {
    expect(
      transformCreditMemo(makeOrder({ OrderStatus: 'ToPay', ToPay: 5500, TotalIncl: 5500 })).status,
    ).toBe('AUTHORIZED')
  })

  it('maps ToPay status to PARTIALLY_PAID when ToPay < TotalIncl', () => {
    const raw = makeOrder({ OrderStatus: 'ToPay', ToPay: 2000, TotalIncl: 5500 })
    expect(transformCreditMemo(raw).status).toBe('PARTIALLY_PAID')
  })

  it('maps Paid status to PAID', () => {
    expect(transformCreditMemo(makeOrder({ OrderStatus: 'Paid' })).status).toBe('PAID')
  })

  it('maps Paid=true to PAID regardless of OrderStatus', () => {
    expect(transformCreditMemo(makeOrder({ OrderStatus: 'ToPay', Paid: true })).status).toBe('PAID')
  })

  it('maps Canceled status to VOIDED', () => {
    expect(transformCreditMemo(makeOrder({ OrderStatus: 'Canceled' })).status).toBe('VOIDED')
  })

  it('maps tosend status to AUTHORIZED', () => {
    expect(transformCreditMemo(makeOrder({ OrderStatus: 'ToSend' })).status).toBe('AUTHORIZED')
  })

  it('maps sent status to AUTHORIZED', () => {
    expect(transformCreditMemo(makeOrder({ OrderStatus: 'Sent' })).status).toBe('AUTHORIZED')
  })

  it('maps invoiced status to AUTHORIZED', () => {
    expect(transformCreditMemo(makeOrder({ OrderStatus: 'Invoiced' })).status).toBe('AUTHORIZED')
  })

  it('maps Draft status to DRAFT', () => {
    expect(transformCreditMemo(makeOrder({ OrderStatus: 'Draft' })).status).toBe('DRAFT')
  })

  it('computes paidAmount as TotalIncl - ToPay when partially paid', () => {
    const raw = makeOrder({ TotalIncl: 5500, ToPay: 2000, OrderStatus: 'ToPay' })
    expect(transformCreditMemo(raw).paidAmount).toBe(3500)
  })

  it('parses dates as Date objects', () => {
    const result = transformCreditMemo(makeOrder())
    expect(result.postedAt).toEqual(new Date('2024-04-01'))
    expect(result.dueAt).toEqual(new Date('2024-04-30'))
  })

  it('passes schema validation', () => {
    expect(() => CreditMemoSchema.parse(transformCreditMemo(makeOrder()))).not.toThrow()
  })

  it('passes raw object as metadata', () => {
    const raw = makeOrder()
    expect(transformCreditMemo(raw).metadata).toBe(raw)
  })
})
