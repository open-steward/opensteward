import { describe, it, expect } from 'vitest'
import { SalesOrderSchema } from '../../../../../../../src/verticals/accounting/schema/salesorder'
import {
  transformSalesOrder,
  type EcountSalesOrder,
} from '../../../../../../../src/verticals/accounting/adapters/ecount/transform/salesorder'

function makeRaw(overrides: Partial<EcountSalesOrder> = {}): EcountSalesOrder {
  return {
    ORDER_NO: 'SO-2024-001',
    ORDER_DATE: '2024-01-15',
    DUE_DATE: '2024-02-15',
    CUST_CODE: 'CUST-001',
    CUST_NAME: 'Acme Korea Ltd',
    TOTAL_AMT: 110000,
    VAT_AMT: 10000,
    STATUS: '01',
    ITEM_LIST: [],
    ...overrides,
  }
}

describe('transformSalesOrder (Ecount)', () => {
  it('maps core fields correctly', () => {
    const result = transformSalesOrder(makeRaw())
    expect(result.id).toBe('SO-2024-001')
    expect(result.contactId).toBe('CUST-001')
    expect(result.totalAmount).toBe(110000)
  })

  it('parses date as Date object', () => {
    const result = transformSalesOrder(makeRaw())
    expect(result.postedAt).toEqual(new Date('2024-01-15'))
  })

  it('maps STATUS 03 to COMPLETED', () => {
    const result = transformSalesOrder(makeRaw({ STATUS: '03' }))
    expect(result.status).toBe('COMPLETED')
  })

  it('maps STATUS 04 to CANCELLED', () => {
    const result = transformSalesOrder(makeRaw({ STATUS: '04' }))
    expect(result.status).toBe('CANCELLED')
  })

  it('maps other status to ACTIVE', () => {
    const result = transformSalesOrder(makeRaw({ STATUS: '02' }))
    expect(result.status).toBe('ACTIVE')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    const result = transformSalesOrder(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformSalesOrder(makeRaw())
    expect(() => SalesOrderSchema.parse(result)).not.toThrow()
  })
})
