import { describe, it, expect } from 'vitest'
import {
  transformCreditMemo,
  type RilletCreditMemo,
  type RilletCreditMemoItem,
} from '../../../../../../../src/verticals/accounting/adapters/rillet/transform/creditmemo'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'

function makeItem(overrides: Partial<RilletCreditMemoItem> = {}): RilletCreditMemoItem {
  return {
    id: 'item_1',
    description: 'Widget A',
    quantity: '2.0000',
    net_amount: { amount: '80.00', currency: 'USD' },
    total_amount: { amount: '100.00', currency: 'USD' },
    taxed_amount: { amount: '20.00', currency: 'USD' },
    product_id: 'prod_widget_a',
    ...overrides,
  }
}

function makeCreditMemo(overrides: Partial<RilletCreditMemo> = {}): RilletCreditMemo {
  return {
    id: 'cm_3010',
    subsidiary_id: 'sub_1',
    credit_memo_number: 'CM-3010',
    customer_id: 'cust_1',
    items: [makeItem()],
    credit_memo_date: '2026-02-01',
    status: 'PARTIALLY_APPLIED',
    net_amount: { amount: '80.00', currency: 'USD' },
    total: { amount: '100.00', currency: 'USD' },
    applied_amount: { amount: '60.00', currency: 'USD' },
    remaining_amount: { amount: '40.00', currency: 'USD' },
    taxed_amount: { amount: '20.00', currency: 'USD' },
    updated_at: '2026-02-02T10:00:00Z',
    ...overrides,
  }
}

describe('transformCreditMemo', () => {
  it('maps id directly', () => {
    expect(transformCreditMemo(makeCreditMemo()).id).toBe('cm_3010')
  })

  it('maps customer_id to contactId', () => {
    expect(transformCreditMemo(makeCreditMemo()).contactId).toBe('cust_1')
  })

  it('maps credit_memo_number to creditmemoNumber', () => {
    expect(transformCreditMemo(makeCreditMemo()).creditmemoNumber).toBe('CM-3010')
  })

  it('maps currency from total.currency', () => {
    expect(transformCreditMemo(makeCreditMemo()).currency).toBe('USD')
  })

  it.each([
    ['UNAPPLIED', 'AUTHORIZED'],
    ['PARTIALLY_APPLIED', 'PARTIALLY_PAID'],
    ['APPLIED', 'PAID'],
    ['REFUNDED', 'PAID'],
  ])('maps documented status %s to %s', (status, expected) => {
    expect(CreditMemoSchema.parse(transformCreditMemo(makeCreditMemo({ status }))).status).toBe(
      expected,
    )
  })

  it('maps an undocumented status to unknown, not a guess', () => {
    expect(transformCreditMemo(makeCreditMemo({ status: 'UNPAID' })).status).toBe('unknown')
  })

  it('converts total.amount string to minor units', () => {
    // "100.00" → 10000
    expect(transformCreditMemo(makeCreditMemo()).totalAmount).toBe(10000)
  })

  it('converts taxed_amount.amount string to minor units', () => {
    // "20.00" → 2000
    expect(transformCreditMemo(makeCreditMemo()).taxAmount).toBe(2000)
  })

  it('maps remaining_amount to balanceAmount and applied_amount to paidAmount', () => {
    const out = CreditMemoSchema.parse(transformCreditMemo(makeCreditMemo()))
    // "40.00" → 4000, "60.00" → 6000
    expect(out.balanceAmount).toBe(4000)
    expect(out.paidAmount).toBe(6000)
  })

  it('does not read the undocumented amount_due or due_date', () => {
    const out = CreditMemoSchema.parse(
      transformCreditMemo(
        makeCreditMemo({
          amount_due: { amount: '999.00', currency: 'USD' },
          due_date: '2026-03-03',
        }),
      ),
    )
    expect(out.balanceAmount).toBe(4000)
    expect(out.dueAt).toBeUndefined()
  })

  it('maps credit_memo_date to postedAt Date', () => {
    expect(transformCreditMemo(makeCreditMemo()).postedAt).toEqual(new Date('2026-02-01'))
  })

  it('maps updated_at to updatedAt Date', () => {
    expect(transformCreditMemo(makeCreditMemo()).updatedAt).toEqual(
      new Date('2026-02-02T10:00:00Z'),
    )
  })

  it('maps lineitem fields: id, itemId, itemDescription, quantity, amounts', () => {
    const result = transformCreditMemo(makeCreditMemo())
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('item_1')
    expect(li.itemId).toBe('prod_widget_a')
    expect(li.itemDescription).toBe('Widget A')
    expect(li.unitQuantity).toBe(2)
    // "100.00" → 10000
    expect(li.totalAmount).toBe(10000)
    // "20.00" → 2000
    expect(li.taxAmount).toBe(2000)
  })

  it('parses both the v4.0 decimal-string and the v3.0 numeric quantity', () => {
    for (const quantity of ['3.0000', 3]) {
      const cm = makeCreditMemo({ items: [makeItem({ quantity })] })
      expect(CreditMemoSchema.parse(transformCreditMemo(cm)).lineItems?.[0]?.unitQuantity).toBe(3)
    }
  })

  it('maps each documented application to an appliedTo entry', () => {
    const out = CreditMemoSchema.parse(
      transformCreditMemo(
        makeCreditMemo({
          applications: [
            {
              id: 'app_1',
              credit_memo_id: 'cm_3010',
              invoice_id: 'inv_1042',
              invoice_number: 'INV-1042',
              amount: { amount: '60.00', currency: 'USD' },
              application_date: '2026-02-10',
            },
            {
              id: 'app_2',
              credit_memo_id: 'cm_3010',
              invoice_id: 'inv_1043',
              amount: { amount: '40.05', currency: 'USD' },
              application_date: '2026-02-11',
            },
          ],
        }),
      ),
    )
    expect(out.appliedTo).toEqual([
      { invoiceId: 'inv_1042', invoiceNumber: 'INV-1042', amount: 6000, appliedAt: '2026-02-10' },
      { invoiceId: 'inv_1043', amount: 4005, appliedAt: '2026-02-11' },
    ])
  })

  it('reports an empty applications list as an empty appliedTo', () => {
    const out = CreditMemoSchema.parse(transformCreditMemo(makeCreditMemo({ applications: [] })))
    expect(out.appliedTo).toEqual([])
  })

  it('omits appliedTo when applications is absent', () => {
    const out = CreditMemoSchema.parse(transformCreditMemo(makeCreditMemo()))
    expect(out.appliedTo).toBeUndefined()
  })

  it('does not read an undocumented top-level invoice_id', () => {
    const out = CreditMemoSchema.parse(
      transformCreditMemo(makeCreditMemo({ invoice_id: 'inv_undocumented' })),
    )
    expect(out.appliedTo).toBeUndefined()
  })

  it('passes raw object as metadata (reference equality)', () => {
    const raw = makeCreditMemo()
    expect(transformCreditMemo(raw).metadata).toBe(raw)
  })

  it('produces output that passes CreditMemoSchema validation', () => {
    const result = transformCreditMemo(makeCreditMemo())
    expect(() => CreditMemoSchema.parse(result)).not.toThrow()
  })

  it('does not scale a zero-decimal currency (JPY) by 100', () => {
    const jpy = (amount: string) => ({ amount, currency: 'JPY' })
    const cm = makeCreditMemo({
      items: [
        makeItem({
          net_amount: jpy('8000'),
          total_amount: jpy('10000'),
          taxed_amount: jpy('2000'),
        }),
      ],
      net_amount: jpy('8000'),
      total: jpy('10000'),
      applied_amount: jpy('6000'),
      remaining_amount: jpy('4000'),
      taxed_amount: jpy('2000'),
    })
    const out = CreditMemoSchema.parse(transformCreditMemo(cm))
    expect(out.currency).toBe('JPY')
    expect(out.totalAmount).toBe(10000)
    expect(out.paidAmount).toBe(6000)
    expect(out.balanceAmount).toBe(4000)
    expect(out.lineItems?.[0]?.totalAmount).toBe(10000)
  })

  it('scales a three-decimal currency (BHD) by 1000', () => {
    const bhd = (amount: string) => ({ amount, currency: 'BHD' })
    const cm = makeCreditMemo({
      items: [
        makeItem({
          net_amount: bhd('8.000'),
          total_amount: bhd('8.800'),
          taxed_amount: bhd('0.800'),
        }),
      ],
      net_amount: bhd('8.000'),
      total: bhd('8.800'),
      applied_amount: bhd('6.125'),
      remaining_amount: bhd('2.675'),
      taxed_amount: bhd('0.800'),
    })
    const out = CreditMemoSchema.parse(transformCreditMemo(cm))
    expect(out.currency).toBe('BHD')
    expect(out.totalAmount).toBe(8800)
    expect(out.taxAmount).toBe(800)
    expect(out.paidAmount).toBe(6125)
    expect(out.balanceAmount).toBe(2675)
    expect(out.lineItems?.[0]?.taxAmount).toBe(800)
  })
})
