import { describe, it, expect } from 'vitest'
import { transformBill } from '../../../../../../../src/verticals/accounting/adapters/fakturownia/transform/bill'
import type { FakturowniaInvoice } from '../../../../../../../src/verticals/accounting/adapters/fakturownia/transform/invoice'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'

function makeRaw(overrides: Partial<FakturowniaInvoice> = {}): FakturowniaInvoice {
  return {
    id: 1001,
    number: 'EXP/2024/001',
    status: 'issued',
    issue_date: '2024-01-15',
    payment_to: '2024-02-15',
    currency: 'PLN',
    price_gross: 123.0,
    price_tax: 23.0,
    price_net: 100.0,
    paid: 0,
    client_id: 5,
    positions: [],
    ...overrides,
  }
}

describe('fakturownia transformBill', () => {
  it('maps id to string', () => {
    const result = transformBill(makeRaw({ id: 9999 }))
    expect(result.id).toBe('9999')
  })

  it('maps number to billNumber', () => {
    const result = transformBill(makeRaw({ number: 'EXP/001' }))
    expect(result.billNumber).toBe('EXP/001')
  })

  it('maps client_id to contactId as string', () => {
    const result = transformBill(makeRaw({ client_id: 42 }))
    expect(result.contactId).toBe('42')
  })

  it('major-unit price_gross → minor units', () => {
    const result = transformBill(makeRaw({ price_gross: 12.34 }))
    expect(result.totalAmount).toBe(1234)
  })

  it('major-unit price_tax → minor units', () => {
    const result = transformBill(makeRaw({ price_tax: 2.3 }))
    expect(result.taxAmount).toBe(230)
  })

  it('balanceAmount = total - paid (minor units)', () => {
    const result = transformBill(makeRaw({ price_gross: 100, paid: 30 }))
    expect(result.balanceAmount).toBe(7000)
  })

  it('status paid → PAID', () => {
    const result = transformBill(makeRaw({ status: 'paid' }))
    expect(result.status).toBe('PAID')
  })

  it('status partial → PARTIALLY_PAID', () => {
    const result = transformBill(makeRaw({ status: 'partial' }))
    expect(result.status).toBe('PARTIALLY_PAID')
  })

  it('status rejected → VOIDED', () => {
    const result = transformBill(makeRaw({ status: 'rejected' }))
    expect(result.status).toBe('VOIDED')
  })

  it('status issued → AUTHORIZED', () => {
    const result = transformBill(makeRaw({ status: 'issued' }))
    expect(result.status).toBe('AUTHORIZED')
  })

  it('status sent → AUTHORIZED', () => {
    const result = transformBill(makeRaw({ status: 'sent' }))
    expect(result.status).toBe('AUTHORIZED')
  })

  it('unknown status → DRAFT', () => {
    const result = transformBill(makeRaw({ status: '' }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps issue_date to postedAt as Date', () => {
    const result = transformBill(makeRaw({ issue_date: '2024-03-01' }))
    expect(result.postedAt).toBeInstanceOf(Date)
  })

  it('maps position to lineitem with minor units', () => {
    const result = transformBill(
      makeRaw({
        positions: [
          {
            id: 1,
            name: 'Consulting',
            quantity: 2,
            price_net: 50,
            total_price_gross: 123,
            total_price_net: 100,
          },
        ],
      }),
    )
    expect(result.lineItems?.[0]?.totalAmount).toBe(12300)
  })

  it('metadata is the raw object', () => {
    const raw = makeRaw()
    const result = transformBill(raw)
    expect(result.metadata).toBe(raw)
  })

  it('passes BillSchema.parse without throwing', () => {
    const result = transformBill(makeRaw())
    expect(() => BillSchema.parse(result)).not.toThrow()
  })
})
