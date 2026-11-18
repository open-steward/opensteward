import { describe, it, expect } from 'vitest'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'
import {
  transformBill,
} from '../../../../../../../src/verticals/accounting/adapters/giddh/transform/bill'
import type { GiddhVoucher } from '../../../../../../../src/verticals/accounting/adapters/giddh/transform/invoice'

function makeRaw(overrides: Partial<GiddhVoucher> = {}): GiddhVoucher {
  return {
    uniqueName: 'voucher-purchase-001',
    number: 'BILL-001',
    voucherDate: '2024-03-02',
    dueDate: '2024-04-01',
    grandTotal: 59000,
    taxesTotal: 9000,
    subTotal: 50000,
    balanceDue: 59000,
    currency: 'INR',
    account: { uniqueName: 'vendor-xyz', name: 'XYZ Suppliers' },
    entries: [],
    status: 'pending',
    ...overrides,
  }
}

describe('transformBill (giddh)', () => {
  it('maps core fields correctly', () => {
    const result = transformBill(makeRaw())
    expect(result.id).toBe('voucher-purchase-001')
    expect(result.billNumber).toBe('BILL-001')
    expect(result.contactId).toBe('vendor-xyz')
    expect(result.currency).toBe('INR')
    expect(result.totalAmount).toBe(59000)
    expect(result.taxAmount).toBe(9000)
    expect(result.balanceAmount).toBe(59000)
  })

  it('parses dates as Date objects', () => {
    const result = transformBill(makeRaw())
    expect(result.postedAt).toEqual(new Date('2024-03-02'))
    expect(result.dueAt).toEqual(new Date('2024-04-01'))
  })

  it('maps status pending to AUTHORIZED', () => {
    expect(transformBill(makeRaw({ status: 'pending' })).status).toBe('AUTHORIZED')
  })

  it('maps status paid to PAID', () => {
    expect(transformBill(makeRaw({ status: 'paid' })).status).toBe('PAID')
  })

  it('maps status cancel to VOIDED', () => {
    expect(transformBill(makeRaw({ status: 'cancel' })).status).toBe('VOIDED')
  })

  it('maps status partial to PARTIALLY_PAID', () => {
    expect(transformBill(makeRaw({ status: 'partial' })).status).toBe('PARTIALLY_PAID')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    const result = transformBill(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformBill(makeRaw())
    expect(() => BillSchema.parse(result)).not.toThrow()
  })
})
