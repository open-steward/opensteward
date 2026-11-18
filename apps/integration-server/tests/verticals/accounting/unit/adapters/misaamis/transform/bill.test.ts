import { describe, it, expect } from 'vitest'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'
import {
  transformBill,
  type MisaAmisBill,
} from '../../../../../../../src/verticals/accounting/adapters/misaamis/transform/bill'

function makeRaw(overrides: Partial<MisaAmisBill> = {}): MisaAmisBill {
  return {
    id: 'bill-001',
    invoice_number: 'BILL-2024-001',
    invoice_date: '2024-03-01',
    due_date: '2024-03-31',
    total_amount: 2000000,
    vat_amount: 200000,
    total_payment: 2200000,
    remaining_amount: 2200000,
    currency_code: 'VND',
    partner_id: 'vendor-001',
    partner_name: 'Nhà cung cấp XYZ',
    status: 0,
    invoice_details: [],
    ...overrides,
  }
}

describe('transformBill (misaamis)', () => {
  it('maps core fields correctly', () => {
    const result = transformBill(makeRaw())
    expect(result.id).toBe('bill-001')
    expect(result.billNumber).toBe('BILL-2024-001')
    expect(result.contactId).toBe('vendor-001')
    expect(result.currency).toBe('VND')
    expect(result.totalAmount).toBe(2200000)
    expect(result.taxAmount).toBe(200000)
    expect(result.balanceAmount).toBe(2200000)
  })

  it('parses dates as Date objects', () => {
    const result = transformBill(makeRaw())
    expect(result.postedAt).toEqual(new Date('2024-03-01'))
    expect(result.dueAt).toEqual(new Date('2024-03-31'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    const result = transformBill(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps status 0 to DRAFT', () => {
    expect(transformBill(makeRaw({ status: 0 })).status).toBe('DRAFT')
  })

  it('maps status 1 to AUTHORIZED', () => {
    expect(transformBill(makeRaw({ status: 1 })).status).toBe('AUTHORIZED')
  })

  it('maps status 2 to PAID', () => {
    expect(transformBill(makeRaw({ status: 2 })).status).toBe('PAID')
  })

  it('maps status 3 to VOIDED', () => {
    expect(transformBill(makeRaw({ status: 3 })).status).toBe('VOIDED')
  })

  it('maps status 4 to PARTIALLY_PAID', () => {
    expect(transformBill(makeRaw({ status: 4 })).status).toBe('PARTIALLY_PAID')
  })

  it('maps invoice_details to lineItems', () => {
    const raw = makeRaw({
      invoice_details: [
        {
          id: 'detail-001',
          description: 'Mua nguyên vật liệu',
          unit: 'kg',
          quantity: 100,
          unit_price: 20000,
          amount: 2000000,
          vat_rate: 10,
          vat_amount: 200000,
          account_id: 'acc-002',
          account_code: '1521',
        },
      ],
    })
    const result = transformBill(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('detail-001')
    expect(li.accountId).toBe('acc-002')
    expect(li.totalAmount).toBe(2000000)
    expect(li.taxAmount).toBe(200000)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformBill(makeRaw())
    expect(() => BillSchema.parse(result)).not.toThrow()
  })
})
