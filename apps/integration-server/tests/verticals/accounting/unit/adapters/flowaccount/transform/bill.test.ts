import { describe, it, expect } from 'vitest'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'
import { transformBill, type FlowAccountBill } from '../../../../../../../src/verticals/accounting/adapters/flowaccount/transform/bill'

function makeBill(overrides: Partial<FlowAccountBill> = {}): FlowAccountBill {
  return {
    id: 600,
    documentSerial: 'PI2024-00001',
    statusId: 2,
    issuedDate: '2024-01-10',
    dueDate: '2024-02-10',
    amountTotal: 5350,
    vatTotal: 350,
    currencyCode: 'THB',
    contactCode: 'SUPP-001',
    items: [],
    ...overrides,
  }
}

describe('transformBill', () => {
  it('maps core fields correctly', () => {
    const result = transformBill(makeBill())
    expect(result.id).toBe('600')
    expect(result.billNumber).toBe('PI2024-00001')
    expect(result.contactId).toBe('SUPP-001')
    expect(result.totalAmount).toBe(5350)
    expect(result.taxAmount).toBe(350)
    expect(result.currency).toBe('THB')
  })

  it('parses dates as Date objects', () => {
    const result = transformBill(makeBill())
    expect(result.postedAt).toEqual(new Date('2024-01-10'))
    expect(result.dueAt).toEqual(new Date('2024-02-10'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeBill()
    const result = transformBill(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps statusId 1 to DRAFT', () => {
    expect(transformBill(makeBill({ statusId: 1 })).status).toBe('DRAFT')
  })

  it('maps statusId 2 to AUTHORIZED', () => {
    expect(transformBill(makeBill({ statusId: 2 })).status).toBe('AUTHORIZED')
  })

  it('maps statusId 3 to PAID', () => {
    expect(transformBill(makeBill({ statusId: 3 })).status).toBe('PAID')
  })

  it('maps statusId 4 to VOIDED', () => {
    expect(transformBill(makeBill({ statusId: 4 })).status).toBe('VOIDED')
  })

  it('maps statusId 5 to PARTIALLY_PAID', () => {
    expect(transformBill(makeBill({ statusId: 5 })).status).toBe('PARTIALLY_PAID')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformBill(makeBill())
    expect(() => BillSchema.parse(result)).not.toThrow()
  })
})
