import { describe, it, expect } from 'vitest'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'
import {
  transformBill,
  type DeskeraBill,
} from '../../../../../../../src/verticals/accounting/adapters/deskera/transform/bill'

function makeRaw(overrides: Partial<DeskeraBill> = {}): DeskeraBill {
  return {
    id: 'BILL-001',
    documentSequenceCode: 'PI-0001',
    documentDate: '2024-01-10',
    validTillDate: '2024-02-10',
    totalAmount: 5900,
    taxAmount: 900,
    dueAmount: 5900,
    subTotal: 5000,
    currency: 'SGD',
    contactCode: 'VEND-001',
    contactName: 'Supplier Co',
    status: 'OPEN',
    documentItems: [],
    memo: 'Purchase bill',
    ...overrides,
  }
}

describe('transformBill (Deskera)', () => {
  it('maps core fields correctly', () => {
    const result = transformBill(makeRaw())
    expect(result.id).toBe('BILL-001')
    expect(result.billNumber).toBe('PI-0001')
    expect(result.contactId).toBe('VEND-001')
    expect(result.totalAmount).toBe(5900)
    expect(result.taxAmount).toBe(900)
    expect(result.balanceAmount).toBe(5900)
    expect(result.currency).toBe('SGD')
    expect(result.notes).toBe('Purchase bill')
  })

  it('parses dates as Date objects', () => {
    const result = transformBill(makeRaw())
    expect(result.postedAt).toEqual(new Date('2024-01-10'))
    expect(result.dueAt).toEqual(new Date('2024-02-10'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    const result = transformBill(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps DRAFT status correctly', () => {
    const result = transformBill(makeRaw({ status: 'DRAFT' }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps OPEN to AUTHORIZED', () => {
    const result = transformBill(makeRaw({ status: 'OPEN' }))
    expect(result.status).toBe('AUTHORIZED')
  })

  it('maps PAID status correctly', () => {
    const result = transformBill(makeRaw({ status: 'PAID' }))
    expect(result.status).toBe('PAID')
  })

  it('maps VOID to VOIDED', () => {
    const result = transformBill(makeRaw({ status: 'VOID' }))
    expect(result.status).toBe('VOIDED')
  })

  it('maps document items to lineItems', () => {
    const raw = makeRaw({
      documentItems: [
        {
          id: 'li-1',
          name: 'Service',
          description: 'Consulting service',
          quantity: 2,
          unitPrice: 2500,
          totalAmount: 5000,
          taxAmount: 900,
          accountCode: 'EXP-001',
        },
      ],
    })
    const result = transformBill(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.itemDescription).toBe('Consulting service')
    expect(li.unitAmount).toBe(2500)
    expect(li.totalAmount).toBe(5000)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformBill(makeRaw())
    expect(() => BillSchema.parse(result)).not.toThrow()
  })
})
