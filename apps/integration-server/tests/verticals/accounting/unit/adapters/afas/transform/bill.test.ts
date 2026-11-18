import { describe, it, expect } from 'vitest'
import {
  transformBill,
  type AfasPurchaseInvoice,
} from '../../../../../../../src/verticals/accounting/adapters/afas/transform/bill'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'

function makeRaw(overrides: Partial<AfasPurchaseInvoice> = {}): AfasPurchaseInvoice {
  return {
    InvoiceNr: 'BILL-200',
    CreditorId: 'CR-001',
    Description: 'Office supplies',
    AmtInvoice: 500,
    AmtInvoiceCurr: 500,
    Balance: 500,
    BalanceCurr: 500,
    CurrencyId: 'EUR',
    ExpDate: '2024-03-01',
    NookPieceDate: '2024-02-01',
    ...overrides,
  }
}

describe('transformBill (afas)', () => {
  it('maps core fields correctly', () => {
    const result = transformBill(makeRaw())
    expect(result.id).toBe('BILL-200')
    expect(result.billNumber).toBe('BILL-200')
    expect(result.contactId).toBe('CR-001')
    expect(result.currency).toBe('EUR')
    // AmtInvoice=500 → toMinorUnits → 50000
    expect(result.totalAmount).toBe(50000)
    expect(result.balanceAmount).toBe(50000)
  })

  it('parses dates as Date objects', () => {
    const result = transformBill(makeRaw())
    expect(result.postedAt).toEqual(new Date('2024-02-01'))
    expect(result.dueAt).toEqual(new Date('2024-03-01'))
  })

  it('maps balance=0 to PAID', () => {
    const result = transformBill(makeRaw({ AmtInvoice: 500, Balance: 0 }))
    expect(result.status).toBe('PAID')
  })

  it('maps partial balance to PARTIALLY_PAID', () => {
    const result = transformBill(makeRaw({ AmtInvoice: 500, Balance: 250 }))
    expect(result.status).toBe('PARTIALLY_PAID')
  })

  it('maps full positive balance to AUTHORIZED', () => {
    const result = transformBill(makeRaw({ AmtInvoice: 500, Balance: 500 }))
    expect(result.status).toBe('AUTHORIZED')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    const result = transformBill(raw)
    expect(result.metadata).toBe(raw)
  })

  it('passes BillSchema.parse without throwing', () => {
    const result = transformBill(makeRaw())
    expect(() => BillSchema.parse(result)).not.toThrow()
  })
})
