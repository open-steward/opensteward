import { describe, it, expect } from 'vitest'
import { SalesOrderSchema } from '../../../../../../../src/verticals/accounting/schema/salesorder'
import {
  transformSalesOrder,
  type AutocountSalesOrder,
} from '../../../../../../../src/verticals/accounting/adapters/autocount/transform/salesorder'

function makeRaw(overrides: Partial<AutocountSalesOrder> = {}): AutocountSalesOrder {
  return {
    DocNo: 'SOR-001',
    DocDate: '2024-03-05',
    DueDate: '2024-04-05',
    SubTotal: 2500,
    TaxAmt: 150,
    DocAmt: 2650,
    DebtorCode: 'D002',
    DebtorName: 'Beta Corp',
    Cancelled: false,
    Status: 0,
    DetailItems: [],
    ...overrides,
  }
}

describe('transformSalesOrder (autocount)', () => {
  it('maps core fields correctly', () => {
    const result = transformSalesOrder(makeRaw())
    expect(result.id).toBe('SOR-001')
    expect(result.contactId).toBe('D002')
    expect(result.totalAmount).toBe(2650)
  })

  it('parses date as Date object', () => {
    const result = transformSalesOrder(makeRaw())
    expect(result.postedAt).toEqual(new Date('2024-03-05'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    const result = transformSalesOrder(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps Status 0 to ACTIVE', () => {
    const result = transformSalesOrder(makeRaw({ Status: 0 }))
    expect(result.status).toBe('ACTIVE')
  })

  it('maps Status 2 to COMPLETED', () => {
    const result = transformSalesOrder(makeRaw({ Status: 2 }))
    expect(result.status).toBe('COMPLETED')
  })

  it('maps Cancelled to CANCELLED', () => {
    const result = transformSalesOrder(makeRaw({ Cancelled: true }))
    expect(result.status).toBe('CANCELLED')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformSalesOrder(makeRaw())
    expect(() => SalesOrderSchema.parse(result)).not.toThrow()
  })
})
