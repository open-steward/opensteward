import { describe, it, expect } from 'vitest'
import { transformBill } from '../../../../../../../src/verticals/accounting/adapters/vosfactures/transform/bill'
import type { VosFacturesInvoice } from '../../../../../../../src/verticals/accounting/adapters/vosfactures/transform/invoice'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'

function makeBillRaw(overrides: Partial<VosFacturesInvoice> = {}): VosFacturesInvoice {
  return {
    id: 3003,
    number: 'KUP/2024/003',
    kind: 'vat',
    status: 'issued',
    income: '0',
    issue_date: '2024-07-01',
    payment_to: '2024-07-31',
    currency: 'PLN',
    price_gross: '369.00',
    price_net: '300.00',
    price_tax: '69.00',
    paid: '0',
    client_id: 200,
    description: 'Office supplies',
    ...overrides,
  }
}

describe('transformBill', () => {
  it('maps core fields correctly', () => {
    const result = transformBill(makeBillRaw())
    expect(result.id).toBe('3003')
    expect(result.billNumber).toBe('KUP/2024/003')
    expect(result.contactId).toBe('200')
    expect(result.currency).toBe('PLN')
    expect(result.notes).toBe('Office supplies')
  })

  it('reads price_gross, price_tax and paid in minor units of the currency', () => {
    const result = BillSchema.parse(
      transformBill(makeBillRaw({ price_gross: '369,99', price_tax: '69.19', paid: '100' })),
    )
    expect(result.totalAmount).toBe(36999)
    expect(result.taxAmount).toBe(6919)
    expect(result.paidAmount).toBe(10000)
    expect(result.balanceAmount).toBe(26999)
  })

  it('scales by the currency exponent', () => {
    const result = BillSchema.parse(
      transformBill(makeBillRaw({ currency: 'JPY', price_gross: '369', price_tax: '33' })),
    )
    expect(result.totalAmount).toBe(369)
    expect(result.taxAmount).toBe(33)
  })

  it('maps positions in minor units, tax as total gross - total net', () => {
    const result = BillSchema.parse(
      transformBill(
        makeBillRaw({
          positions: [
            {
              id: 9,
              name: 'Paper',
              price_net: '59,00',
              tax: '23',
              quantity: '1',
              total_price_net: '59,00',
              total_price_gross: '72,57',
            },
          ],
        }),
      ),
    )
    expect(result.lineItems).toEqual([
      expect.objectContaining({
        id: '9',
        unitAmount: 5900,
        unitQuantity: 1,
        taxAmount: 1357,
        totalAmount: 7257,
      }),
    ])
  })

  it('maps status issued to DRAFT', () => {
    const result = transformBill(makeBillRaw({ status: 'issued' }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps status paid to PAID', () => {
    const result = transformBill(makeBillRaw({ status: 'paid' }))
    expect(result.status).toBe('PAID')
  })

  it('maps status sent to AUTHORIZED', () => {
    const result = transformBill(makeBillRaw({ status: 'sent' }))
    expect(result.status).toBe('AUTHORIZED')
  })

  it('maps status rejected to VOIDED', () => {
    const result = transformBill(makeBillRaw({ status: 'rejected' }))
    expect(result.status).toBe('VOIDED')
  })

  it('parses dates as Date objects', () => {
    const result = transformBill(makeBillRaw())
    expect(result.postedAt).toEqual(new Date('2024-07-01'))
    expect(result.dueAt).toEqual(new Date('2024-07-31'))
  })

  it('passes raw as metadata', () => {
    const raw = makeBillRaw()
    const result = transformBill(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a schema-valid result', () => {
    const result = transformBill(makeBillRaw())
    expect(() => BillSchema.parse(result)).not.toThrow()
  })
})
