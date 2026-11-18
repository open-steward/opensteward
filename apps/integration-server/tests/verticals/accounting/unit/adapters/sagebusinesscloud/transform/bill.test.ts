import { describe, it, expect } from 'vitest'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'
import { transformBill, type SageBill } from '../../../../../../../src/verticals/accounting/adapters/sagebusinesscloud/transform/bill'

function makeRaw(overrides: Partial<SageBill> = {}): SageBill {
  return {
    id: 'BILL-001',
    invoice_number: 'PI-0001',
    date: '2024-01-15',
    due_date: '2024-02-15',
    net_amount: 5000,
    tax_amount: 1000,
    total_amount: 6000,
    outstanding_amount: 6000,
    status: { id: 'DRAFT' },
    contact: { id: 'SUPPLIER-001' },
    currency: { id: 'GBP' },
    line_items: [],
    ...overrides,
  }
}

describe('transformBill (SageBusinessCloud)', () => {
  it('maps core fields correctly', () => {
    const result = transformBill(makeRaw())
    expect(result.id).toBe('BILL-001')
    expect(result.billNumber).toBe('PI-0001')
    expect(result.contactId).toBe('SUPPLIER-001')
    expect(result.totalAmount).toBe(6000)
    expect(result.taxAmount).toBe(1000)
    expect(result.balanceAmount).toBe(6000)
    expect(result.currency).toBe('GBP')
  })

  it('parses dates as Date objects', () => {
    const result = transformBill(makeRaw())
    expect(result.postedAt).toEqual(new Date('2024-01-15'))
    expect(result.dueAt).toEqual(new Date('2024-02-15'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    expect(transformBill(raw).metadata).toBe(raw)
  })

  it('maps DRAFT status correctly', () => {
    expect(transformBill(makeRaw({ status: { id: 'DRAFT' } })).status).toBe('DRAFT')
  })

  it('maps AUTHORISED status to AUTHORIZED', () => {
    expect(transformBill(makeRaw({ status: { id: 'AUTHORISED' } })).status).toBe('AUTHORIZED')
  })

  it('maps PAID status correctly', () => {
    expect(transformBill(makeRaw({ status: { id: 'PAID' } })).status).toBe('PAID')
  })

  it('maps VOID status to VOIDED', () => {
    expect(transformBill(makeRaw({ status: { id: 'VOID' } })).status).toBe('VOIDED')
  })

  it('maps line items correctly', () => {
    const raw = makeRaw({
      line_items: [
        { id: 'LI-001', description: 'Office supplies', quantity: 1, unit_price: 5000, net_amount: 5000, tax_amount: 1000, ledger_account: { id: 'ACC-002' } },
      ],
    })
    const result = transformBill(raw)
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].accountId).toBe('ACC-002')
    expect(result.lineItems![0].totalAmount).toBe(5000)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformBill(makeRaw())
    expect(() => BillSchema.parse(result)).not.toThrow()
  })
})
