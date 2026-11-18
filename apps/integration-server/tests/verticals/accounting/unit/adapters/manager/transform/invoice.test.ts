import { describe, it, expect } from 'vitest'
import {
  transformInvoice,
  untransformInvoice,
  type ManagerSalesInvoice,
} from '../../../../../../../src/verticals/accounting/adapters/manager/transform/invoice'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'

function makeInvoice(overrides: Partial<ManagerSalesInvoice> = {}): ManagerSalesInvoice {
  return {
    key: 'inv-key-1',
    issueDate: '2024-09-01',
    dueDate: '2024-10-01',
    reference: 'INV-2024-001',
    customer: 'cust-uuid',
    description: 'Software license',
    invoiceAmount: { value: 1000.0, currency: 'USD' },
    balanceDue: { value: 1000.0, currency: 'USD' },
    status: 'Unpaid',
    closedInvoice: false,
    lines: [],
    ...overrides,
  }
}

describe('transformInvoice', () => {
  it('maps key to id and hardcodes type as INVOICE', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.id).toBe('inv-key-1')
    expect(result.type).toBe('INVOICE')
  })

  it('maps reference to invoiceNumber, falls back to key', () => {
    expect(transformInvoice(makeInvoice()).invoiceNumber).toBe('INV-2024-001')
    expect(transformInvoice(makeInvoice({ reference: undefined })).invoiceNumber).toBe('inv-key-1')
  })

  it('maps customer to contactId', () => {
    expect(transformInvoice(makeInvoice()).contactId).toBe('cust-uuid')
  })

  it('converts invoiceAmount to minor units', () => {
    // 1000.0 → 100000
    expect(transformInvoice(makeInvoice()).totalAmount).toBe(100000)
  })

  it('maps status Unpaid to AUTHORIZED', () => {
    expect(transformInvoice(makeInvoice({ status: 'Unpaid' })).status).toBe('AUTHORIZED')
  })

  it('maps status PaidInFull to PAID', () => {
    expect(transformInvoice(makeInvoice({ status: 'PaidInFull' })).status).toBe('PAID')
  })

  it('maps status Overdue to OVERDUE', () => {
    expect(transformInvoice(makeInvoice({ status: 'Overdue' })).status).toBe('OVERDUE')
  })

  it('maps status Void to VOIDED', () => {
    expect(transformInvoice(makeInvoice({ status: 'Void' })).status).toBe('VOIDED')
  })

  it('maps closedInvoice=true to PAID', () => {
    expect(transformInvoice(makeInvoice({ status: undefined, closedInvoice: true })).status).toBe(
      'PAID',
    )
  })

  it('computes paidAmount as totalAmount - balanceAmount', () => {
    const result = transformInvoice(
      makeInvoice({
        invoiceAmount: { value: 1000.0, currency: 'USD' },
        balanceDue: { value: 600.0, currency: 'USD' },
        status: 'PartiallyPaid',
      }),
    )
    expect(result.totalAmount).toBe(100000)
    expect(result.balanceAmount).toBe(60000)
    expect(result.paidAmount).toBe(40000)
  })

  it('parses issueDate as postedAt and dueDate as dueAt', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.postedAt).toEqual(new Date('2024-09-01'))
    expect(result.dueAt).toEqual(new Date('2024-10-01'))
  })

  it('maps lines to lineItems using salesUnitPrice', () => {
    const result = transformInvoice(
      makeInvoice({
        lines: [
          {
            account: 'acct-2',
            lineDescription: 'License fee',
            qty: 5,
            salesUnitPrice: 200.0,
            amount: { value: 1000.0, currency: 'USD' },
          },
        ],
      }),
    )
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].unitAmount).toBe(20000)
    expect(result.lineItems![0].unitQuantity).toBe(5)
    expect(result.lineItems![0].totalAmount).toBe(100000)
  })

  it('passes schema validation', () => {
    expect(() => InvoiceSchema.parse(transformInvoice(makeInvoice()))).not.toThrow()
  })

  it('round-trips through untransformInvoice', () => {
    const canonical = transformInvoice(makeInvoice())
    const wire = untransformInvoice(canonical)
    expect(wire.customer).toBe('cust-uuid')
    expect(wire.reference).toBe('INV-2024-001')
    expect(wire.description).toBe('Software license')
  })
})
