import { describe, it, expect } from 'vitest'
import {
  transformBill,
  untransformBill,
  type RefrensExpenditure,
} from '../../../../../../../src/verticals/accounting/adapters/refrens/transform/bill'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'

function makeExpenditure(overrides: Partial<RefrensExpenditure> = {}): RefrensExpenditure {
  return {
    _id: 'exp_001',
    invoiceNumber: 'EXP-001',
    invoiceDate: '2024-02-01',
    dueDate: '2024-03-01',
    currency: 'INR',
    status: 'UNPAID',
    billedBy: { name: 'Supplier Co', gstin: '22AAAAA0000A1Z5' },
    items: [
      {
        name: 'Office Supplies',
        rate: 500,
        quantity: 2,
        igst: 90,
        cgst: 0,
        sgst: 0,
        taxRate: 9,
        total: 1090,
      },
    ],
    finalTotal: {
      total: 1090,
      igst: 90,
      cgst: 0,
      sgst: 0,
      subTotal: 1000,
    },
    createdAt: '2024-01-15T09:00:00.000Z',
    updatedAt: '2024-01-20T10:00:00.000Z',
    ...overrides,
  }
}

describe('transformBill', () => {
  it('maps _id to id', () => {
    const result = transformBill(makeExpenditure({ _id: 'exp_xyz' }))
    expect(result.id).toBe('exp_xyz')
  })

  it('maps invoiceNumber to billNumber', () => {
    const result = transformBill(makeExpenditure({ invoiceNumber: 'EXP-999' }))
    expect(result.billNumber).toBe('EXP-999')
  })

  it('falls back to expenseNumber when invoiceNumber is absent', () => {
    const result = transformBill(
      makeExpenditure({ invoiceNumber: undefined, expenseNumber: 'XPNS-42' }),
    )
    expect(result.billNumber).toBe('XPNS-42')
  })

  it('maps currency', () => {
    const result = transformBill(makeExpenditure({ currency: 'USD' }))
    expect(result.currency).toBe('USD')
  })

  it('maps finalTotal.total to totalAmount', () => {
    const result = transformBill(makeExpenditure())
    expect(result.totalAmount).toBe(1090)
  })

  it('sums igst+cgst+sgst for taxAmount', () => {
    const result = transformBill(
      makeExpenditure({ finalTotal: { total: 1180, igst: 90, cgst: 45, sgst: 45 } }),
    )
    expect(result.taxAmount).toBe(180)
  })

  it('parses invoiceDate as postedAt Date', () => {
    const result = transformBill(makeExpenditure({ invoiceDate: '2024-02-01' }))
    expect(result.postedAt).toEqual(new Date('2024-02-01'))
  })

  it('parses dueDate as dueAt Date', () => {
    const result = transformBill(makeExpenditure({ dueDate: '2024-03-01' }))
    expect(result.dueAt).toEqual(new Date('2024-03-01'))
  })

  it('parses createdAt and updatedAt as Date objects', () => {
    const result = transformBill(makeExpenditure())
    expect(result.createdAt).toEqual(new Date('2024-01-15T09:00:00.000Z'))
    expect(result.updatedAt).toEqual(new Date('2024-01-20T10:00:00.000Z'))
  })

  it('maps line items correctly', () => {
    const result = transformBill(makeExpenditure())
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('1')
    expect(li.itemDescription).toBe('Office Supplies')
    expect(li.unitAmount).toBe(500)
    expect(li.unitQuantity).toBe(2)
    expect(li.totalAmount).toBe(1090)
    expect(li.taxAmount).toBe(90)
  })

  it('passes raw object through as metadata (reference equality)', () => {
    const raw = makeExpenditure()
    const result = transformBill(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces output that satisfies BillSchema', () => {
    const result = transformBill(makeExpenditure())
    expect(() => BillSchema.parse(result)).not.toThrow()
  })

  describe('status mapping', () => {
    it('maps UNPAID to AUTHORIZED', () => {
      expect(transformBill(makeExpenditure({ status: 'UNPAID' })).status).toBe('AUTHORIZED')
    })

    it('maps PAID to PAID', () => {
      expect(transformBill(makeExpenditure({ status: 'PAID' })).status).toBe('PAID')
    })

    it('maps PARTIALLY_PAID to PARTIALLY_PAID', () => {
      expect(transformBill(makeExpenditure({ status: 'PARTIALLY_PAID' })).status).toBe(
        'PARTIALLY_PAID',
      )
    })

    it('maps CANCELED to VOIDED', () => {
      expect(transformBill(makeExpenditure({ status: 'CANCELED' })).status).toBe('VOIDED')
    })

    it('maps CANCELLED (alternative spelling) to VOIDED', () => {
      expect(transformBill(makeExpenditure({ status: 'CANCELLED' })).status).toBe('VOIDED')
    })

    it('maps unknown status to DRAFT', () => {
      expect(transformBill(makeExpenditure({ status: undefined })).status).toBe('DRAFT')
    })

    it('maps empty string status to DRAFT', () => {
      expect(transformBill(makeExpenditure({ status: '' })).status).toBe('DRAFT')
    })
  })
})

describe('untransformBill', () => {
  it('maps billNumber to invoiceNumber', () => {
    const result = untransformBill({ billNumber: 'BILL-42' })
    expect(result.invoiceNumber).toBe('BILL-42')
  })

  it('maps currency', () => {
    const result = untransformBill({ currency: 'USD' })
    expect(result.currency).toBe('USD')
  })

  it('maps postedAt to invoiceDate as YYYY-MM-DD string', () => {
    const result = untransformBill({ postedAt: new Date('2024-03-15T00:00:00.000Z') })
    expect(result.invoiceDate).toBe('2024-03-15')
  })

  it('maps lineItems to items with name/rate/quantity', () => {
    const result = untransformBill({
      lineItems: [{ id: '1', itemDescription: 'Widget', unitAmount: 100, unitQuantity: 3 }],
    })
    expect(Array.isArray(result.items)).toBe(true)
    const item = (result.items as unknown[])[0] as Record<string, unknown>
    expect(item.name).toBe('Widget')
    expect(item.rate).toBe(100)
    expect(item.quantity).toBe(3)
  })

  it('defaults lineitem quantity to 1 when unitQuantity is absent', () => {
    const result = untransformBill({
      lineItems: [{ id: '1', itemDescription: 'Widget', unitAmount: 50 }],
    })
    const item = (result.items as unknown[])[0] as Record<string, unknown>
    expect(item.quantity).toBe(1)
  })

  it('round-trips through transformBill → untransformBill preserving key fields', () => {
    const raw = makeExpenditure()
    const canonical = transformBill(raw)
    const back = untransformBill(canonical)
    expect(back.invoiceNumber).toBe(raw.invoiceNumber)
    expect(back.currency).toBe(raw.currency)
  })
})
