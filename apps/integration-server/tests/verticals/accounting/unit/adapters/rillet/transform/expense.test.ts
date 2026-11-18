import { describe, it, expect } from 'vitest'
import {
  transformExpense,
  type RilletCharge,
  type RilletChargeItem,
} from '../../../../../../../src/verticals/accounting/adapters/rillet/transform/expense'
import { ExpenseSchema } from '../../../../../../../src/verticals/accounting/schema/expense'

/** A `ChargeItem` as documented: account_code, amount and id are required. */
function makeChargeItem(overrides: Partial<RilletChargeItem> = {}): RilletChargeItem {
  return {
    id: 'ci_1',
    description: 'Flight to NYC',
    account_code: '7400',
    amount: { amount: '320.50', currency: 'USD' },
    ...overrides,
  }
}

/** A `Charge` as documented: no header total, tax, employee or created_at. */
function makeCharge(overrides: Partial<RilletCharge> = {}): RilletCharge {
  return {
    id: 'charge_99',
    vendor_id: 'vendor_airline',
    items: [makeChargeItem()],
    charge_date: '2026-02-10',
    impact_date: '2026-02-11',
    subsidiary_id: 'sub_1',
    status: 'UNPAID',
    updated_at: '2026-02-11T08:00:00Z',
    ...overrides,
  }
}

describe('transformExpense', () => {
  it('maps id directly', () => {
    expect(ExpenseSchema.parse(transformExpense(makeCharge())).id).toBe('charge_99')
  })

  it('maps vendor_id to contactId', () => {
    expect(ExpenseSchema.parse(transformExpense(makeCharge())).contactId).toBe('vendor_airline')
  })

  it('takes currency from the first item amount', () => {
    expect(ExpenseSchema.parse(transformExpense(makeCharge())).currency).toBe('USD')
  })

  it('reads no undocumented header fields: no userId, totals or createdAt', () => {
    const raw = {
      ...makeCharge(),
      employee_id: 'emp_jane',
      total_amount: { amount: '999.00', currency: 'USD' },
      tax_amount: { amount: '99.00', currency: 'USD' },
      created_at: '2026-02-10T18:00:00Z',
    }
    const out = ExpenseSchema.parse(transformExpense(raw))
    expect(out.userId).toBeUndefined()
    expect(out.totalAmount).toBeUndefined()
    expect(out.taxAmount).toBeUndefined()
    expect(out.createdAt).toBeUndefined()
  })

  it('maps charge_date to postedAt Date', () => {
    expect(ExpenseSchema.parse(transformExpense(makeCharge())).postedAt).toEqual(
      new Date('2026-02-10'),
    )
  })

  it('maps updated_at to updatedAt Date', () => {
    expect(ExpenseSchema.parse(transformExpense(makeCharge())).updatedAt).toEqual(
      new Date('2026-02-11T08:00:00Z'),
    )
  })

  it('maps lineitem id and description', () => {
    const result = ExpenseSchema.parse(transformExpense(makeCharge()))
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('ci_1')
    expect(li.itemDescription).toBe('Flight to NYC')
  })

  it('maps lineitem account_code to accountCode, not accountId (Account.id is a uuid)', () => {
    const li = ExpenseSchema.parse(transformExpense(makeCharge())).lineItems?.[0]
    expect(li?.accountCode).toBe('7400')
    expect(li?.accountId).toBeUndefined()
  })

  it('converts lineitem amount string to minor units', () => {
    // "320.50" → 32050
    expect(ExpenseSchema.parse(transformExpense(makeCharge())).lineItems?.[0]?.totalAmount).toBe(
      32050,
    )
  })

  it("maps the item's tax_rate.tax_amount to lineitem taxAmount", () => {
    const charge = makeCharge({
      items: [
        makeChargeItem({
          tax_rate: {
            percentage: '10.0000',
            tax_amount: { amount: '28.50', currency: 'USD' },
            country: 'US',
            type: 'SALES_TAX',
            description: 'Sales tax',
            coverage: 'INCLUSIVE',
          },
        }),
      ],
    })
    expect(ExpenseSchema.parse(transformExpense(charge)).lineItems?.[0]?.taxAmount).toBe(2850)
  })

  it('does not scale a zero-decimal currency (JPY) by 100', () => {
    const charge = makeCharge({
      items: [makeChargeItem({ amount: { amount: '32050', currency: 'JPY' } })],
    })
    const out = ExpenseSchema.parse(transformExpense(charge))
    expect(out.currency).toBe('JPY')
    expect(out.lineItems?.[0]?.totalAmount).toBe(32050)
  })

  it('scales a three-decimal currency (KWD) by 1000', () => {
    const charge = makeCharge({
      items: [makeChargeItem({ amount: { amount: '32.050', currency: 'KWD' } })],
    })
    const out = ExpenseSchema.parse(transformExpense(charge))
    expect(out.currency).toBe('KWD')
    expect(out.lineItems?.[0]?.totalAmount).toBe(32050)
  })

  it('yields undefined lineItems when items array is empty', () => {
    const result = ExpenseSchema.parse(transformExpense(makeCharge({ items: [] })))
    expect(result.lineItems).toBeUndefined()
  })

  it('passes raw object as metadata (reference equality)', () => {
    const raw = makeCharge()
    expect(transformExpense(raw).metadata).toBe(raw)
  })

  it('produces output that passes ExpenseSchema validation', () => {
    const result = transformExpense(makeCharge())
    expect(() => ExpenseSchema.parse(result)).not.toThrow()
  })
})
