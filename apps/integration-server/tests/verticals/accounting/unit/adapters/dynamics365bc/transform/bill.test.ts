import { describe, it, expect } from 'vitest'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'
import { transformBill, type BCBill } from '../../../../../../../src/verticals/accounting/adapters/dynamics365bc/transform/bill'

function makeBill(overrides: Partial<BCBill> = {}): BCBill {
  return {
    id: 'bill-1',
    number: 'PI-100',
    vendorId: 'vendor-1',
    vendorNumber: 'V001',
    vendorName: 'Supplier Ltd',
    totalAmountIncludingTax: 1200,
    totalTaxAmount: 200,
    currencyCode: 'GBP',
    status: 'Open',
    ...overrides,
  }
}

describe('transformBill (dynamics365bc)', () => {
  it('maps id and billNumber', () => {
    const result = transformBill(makeBill())
    expect(result.id).toBe('bill-1')
    expect(result.billNumber).toBe('PI-100')
  })

  it('maps contactId from vendorId', () => {
    expect(transformBill(makeBill()).contactId).toBe('vendor-1')
  })

  it('maps totalAmount and taxAmount', () => {
    const result = transformBill(makeBill())
    expect(result.totalAmount).toBe(1200)
    expect(result.taxAmount).toBe(200)
  })

  it('Draft status → DRAFT', () => {
    expect(transformBill(makeBill({ status: 'Draft' })).status).toBe('DRAFT')
  })

  it('Open status → AUTHORIZED', () => {
    expect(transformBill(makeBill({ status: 'Open' })).status).toBe('AUTHORIZED')
  })

  it('Paid status → PAID', () => {
    expect(transformBill(makeBill({ status: 'Paid' })).status).toBe('PAID')
  })

  it('Canceled status → VOIDED', () => {
    expect(transformBill(makeBill({ status: 'Canceled' })).status).toBe('VOIDED')
  })

  it('maps lineItems', () => {
    const bill = makeBill({
      purchaseInvoiceLines: [
        { id: 'li-1', description: 'Service', quantity: 2, directUnitCost: 500, taxAmount: 100, totalAmountExcludingTax: 1000, totalAmountIncludingTax: 1100 },
      ],
    })
    const result = transformBill(bill)
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems?.[0]?.id).toBe('li-1')
  })

  it('passes raw object as metadata', () => {
    const raw = makeBill()
    expect(transformBill(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformBill(makeBill())
    expect(() => BillSchema.parse(result)).not.toThrow()
  })
})
