import { describe, it, expect } from 'vitest'
import {
  transformBill,
  type RilletBill,
  type RilletBillItem,
} from '../../../../../../../src/verticals/accounting/adapters/rillet/transform/bill'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'

function makeItem(overrides: Partial<RilletBillItem> = {}): RilletBillItem {
  return {
    id: 'item_1',
    description: 'Office supplies',
    account_code: '6200',
    amount: { amount: '50.00', currency: 'USD' },
    ...overrides,
  }
}

function makeBill(overrides: Partial<RilletBill> = {}): RilletBill {
  return {
    id: 'bill_42',
    vendor_id: 'vendor_7',
    expense_number: 'BILL-42',
    items: [makeItem()],
    bill_date: '2026-02-01',
    due_date: '2026-03-03',
    status: 'UNPAID',
    updated_at: '2026-02-02T10:00:00Z',
    ...overrides,
  }
}

describe('transformBill', () => {
  it('maps id directly', () => {
    expect(transformBill(makeBill()).id).toBe('bill_42')
  })

  it('maps vendor_id to contactId', () => {
    expect(transformBill(makeBill()).contactId).toBe('vendor_7')
  })

  it('maps expense_number to billNumber', () => {
    expect(transformBill(makeBill()).billNumber).toBe('BILL-42')
  })

  it('maps currency from first item amount.currency', () => {
    expect(transformBill(makeBill()).currency).toBe('USD')
  })

  it('maps UNPAID status to AUTHORIZED', () => {
    expect(transformBill(makeBill({ status: 'UNPAID' })).status).toBe('AUTHORIZED')
  })

  it('maps PAID status to PAID', () => {
    expect(transformBill(makeBill({ status: 'PAID' })).status).toBe('PAID')
  })

  it('maps PARTIALLY_PAID status to PARTIALLY_PAID', () => {
    expect(transformBill(makeBill({ status: 'PARTIALLY_PAID' })).status).toBe('PARTIALLY_PAID')
  })

  it('maps CREDITED status to VOIDED', () => {
    expect(transformBill(makeBill({ status: 'CREDITED' })).status).toBe('VOIDED')
  })

  it('maps DRAFT status to DRAFT', () => {
    expect(BillSchema.parse(transformBill(makeBill({ status: 'DRAFT' }))).status).toBe('DRAFT')
  })

  it('maps PARTIALLY_CREDITED to AUTHORIZED: part of the bill is still owed', () => {
    expect(BillSchema.parse(transformBill(makeBill({ status: 'PARTIALLY_CREDITED' }))).status).toBe(
      'AUTHORIZED',
    )
  })

  it('maps APPLIED, which has no documented meaning on a bill, to unknown', () => {
    expect(BillSchema.parse(transformBill(makeBill({ status: 'APPLIED' }))).status).toBe('unknown')
  })

  it('maps a status outside the documented enum to unknown, not a guess', () => {
    expect(BillSchema.parse(transformBill(makeBill({ status: 'VOID' }))).status).toBe('unknown')
  })

  it('maps bill_date to postedAt Date', () => {
    expect(transformBill(makeBill()).postedAt).toEqual(new Date('2026-02-01'))
  })

  it('maps due_date to dueAt Date', () => {
    expect(transformBill(makeBill()).dueAt).toEqual(new Date('2026-03-03'))
  })

  it('maps updated_at to updatedAt Date', () => {
    expect(transformBill(makeBill()).updatedAt).toEqual(new Date('2026-02-02T10:00:00Z'))
  })

  it('converts item amount string to minor units (cents)', () => {
    const result = transformBill(makeBill())
    // "50.00" → 5000 minor units
    expect(result.lineItems?.[0]?.totalAmount).toBe(5000)
  })

  it('maps item description to lineitem itemDescription', () => {
    const result = transformBill(makeBill())
    expect(result.lineItems?.[0]?.itemDescription).toBe('Office supplies')
  })

  it('maps item id to lineitem id', () => {
    const result = transformBill(makeBill())
    expect(result.lineItems?.[0]?.id).toBe('item_1')
  })

  it('passes raw object as metadata (reference equality)', () => {
    const raw = makeBill()
    expect(transformBill(raw).metadata).toBe(raw)
  })

  it('produces output that passes BillSchema validation', () => {
    const result = transformBill(makeBill())
    expect(() => BillSchema.parse(result)).not.toThrow()
  })

  it('maps item account_code to lineitem accountCode, not accountId (Account.id is a uuid)', () => {
    const li = BillSchema.parse(transformBill(makeBill())).lineItems?.[0]
    expect(li?.accountCode).toBe('6200')
    expect(li?.accountId).toBeUndefined()
  })

  it("maps the item's tax_rate.tax_amount to lineitem taxAmount", () => {
    const bill = makeBill({
      items: [
        makeItem({
          tax_rate: {
            percentage: '20.0000',
            tax_amount: { amount: '10.00', currency: 'USD' },
            country: 'GB',
            type: 'VAT',
            description: 'Standard Rate',
            coverage: 'EXCLUSIVE',
          },
        }),
      ],
    })
    expect(BillSchema.parse(transformBill(bill)).lineItems?.[0]?.taxAmount).toBe(1000)
  })

  it('does not scale a zero-decimal currency (JPY) by 100', () => {
    const bill = makeBill({ items: [makeItem({ amount: { amount: '5000', currency: 'JPY' } })] })
    const out = BillSchema.parse(transformBill(bill))
    expect(out.currency).toBe('JPY')
    expect(out.lineItems?.[0]?.totalAmount).toBe(5000)
  })

  it('scales a three-decimal currency (KWD) by 1000', () => {
    const bill = makeBill({ items: [makeItem({ amount: { amount: '12.345', currency: 'KWD' } })] })
    const out = BillSchema.parse(transformBill(bill))
    expect(out.currency).toBe('KWD')
    expect(out.lineItems?.[0]?.totalAmount).toBe(12345)
  })
})
