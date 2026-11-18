import { describe, it, expect } from 'vitest'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'
import { transformBill, type MoloniBill } from '../../../../../../../src/verticals/accounting/adapters/moloni/transform/bill'

function makeBill(overrides: Partial<MoloniBill> = {}): MoloniBill {
  return {
    document_id: 200,
    document_set_name: 'FC 2024/1',
    status: 0,
    date: '2024-02-01',
    expiration_date: '2024-03-01',
    net_value: 500,
    taxes: [],
    currency_code: 'EUR',
    supplier_id: 10,
    ...overrides,
  }
}

describe('transformBill', () => {
  it('maps core fields correctly', () => {
    const result = transformBill(makeBill())
    expect(result.id).toBe('200')
    expect(result.billNumber).toBe('FC 2024/1')
    expect(result.contactId).toBe('10')
    expect(result.totalAmount).toBe(500)
    expect(result.currency).toBe('EUR')
  })

  it('parses dates as Date objects', () => {
    const result = transformBill(makeBill())
    expect(result.postedAt).toEqual(new Date('2024-02-01'))
    expect(result.dueAt).toEqual(new Date('2024-03-01'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeBill({ document_set_name: 'FC 2024/99' })
    const result = transformBill(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps status 0 to DRAFT', () => {
    expect(transformBill(makeBill({ status: 0 })).status).toBe('DRAFT')
  })

  it('maps status 1 to AUTHORIZED', () => {
    expect(transformBill(makeBill({ status: 1 })).status).toBe('AUTHORIZED')
  })

  it('maps status 2 to VOIDED', () => {
    expect(transformBill(makeBill({ status: 2 })).status).toBe('VOIDED')
  })

  it('sums taxes for taxAmount', () => {
    const result = transformBill(makeBill({ taxes: [{ value: 50 }, { value: 25 }] }))
    expect(result.taxAmount).toBe(75)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformBill(makeBill())
    expect(() => BillSchema.parse(result)).not.toThrow()
  })
})
