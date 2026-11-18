import { describe, it, expect } from 'vitest'
import {
  transformBill,
  type DualentryBill,
} from '../../../../../../../src/verticals/accounting/adapters/dualentry/transform/bill'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'

function makeRaw(overrides: Partial<DualentryBill> = {}): DualentryBill {
  return {
    id: 10,
    number: 1001,
    date: '2024-02-01',
    transaction_date: '2024-02-01',
    due_date: '2024-03-01',
    vendor_id: 5,
    vendor_name: 'Baltic Supplies',
    currency_iso_4217_code: 'EUR',
    amount: '121.00',
    amount_due: '121.00',
    paid_total: '0.00',
    memo: 'Office supplies',
    reference_number: 'REF-001',
    record_status: 'draft',
    expenses: [],
    ...overrides,
  }
}

describe('dualentry transformBill', () => {
  it('maps id to string id', () => {
    const result = transformBill(makeRaw({ id: 99 }))
    expect(result.id).toBe('99')
  })

  it('maps vendor_id with vend_ prefix to contactId', () => {
    const result = transformBill(makeRaw({ vendor_id: 7 }))
    expect(result.contactId).toBe('vend_7')
  })

  it('maps number to billNumber as string', () => {
    const result = transformBill(makeRaw({ number: 2020 }))
    expect(result.billNumber).toBe('2020')
  })

  it('amount string converted to minor units', () => {
    const result = transformBill(makeRaw({ amount: '12.34' }))
    expect(result.totalAmount).toBe(1234)
  })

  it('record_status=draft → status DRAFT', () => {
    const result = transformBill(makeRaw({ record_status: 'draft' }))
    expect(result.status).toBe('DRAFT')
  })

  it('record_status=archived → status VOIDED', () => {
    const result = transformBill(makeRaw({ record_status: 'archived' }))
    expect(result.status).toBe('VOIDED')
  })

  it('posted + paid_total>0 + amount_due=0 → PAID', () => {
    const result = transformBill(
      makeRaw({ record_status: 'posted', paid_total: '121.00', amount_due: '0.00' }),
    )
    expect(result.status).toBe('PAID')
  })

  it('posted + paid_total>0 + amount_due>0 → PARTIALLY_PAID', () => {
    const result = transformBill(
      makeRaw({ record_status: 'posted', paid_total: '50.00', amount_due: '71.00' }),
    )
    expect(result.status).toBe('PARTIALLY_PAID')
  })

  it('posted + paid_total=0 → AUTHORIZED', () => {
    const result = transformBill(
      makeRaw({ record_status: 'posted', paid_total: '0.00', amount_due: '121.00' }),
    )
    expect(result.status).toBe('AUTHORIZED')
  })

  it('maps expense to lineitem with string account id', () => {
    const result = transformBill(
      makeRaw({
        expenses: [
          {
            id: 1,
            position: 1,
            account_number: 5000,
            expense_description: 'Paper',
            rate: '10.00',
            quantity: '2',
            net_amount: '20.00',
            tax_amount: '4.60',
            gross_amount: '24.60',
            amount: '24.60',
          },
        ],
      }),
    )
    expect(result.lineItems?.[0]?.accountId).toBe('5000')
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
