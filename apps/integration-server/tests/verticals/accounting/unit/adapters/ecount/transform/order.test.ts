import { describe, it, expect } from 'vitest'
import { OrderSchema } from '../../../../../../../src/verticals/accounting/schema/order'
import {
  transformOrder,
  type EcountOrder,
} from '../../../../../../../src/verticals/accounting/adapters/ecount/transform/order'

function makeRaw(overrides: Partial<EcountOrder> = {}): EcountOrder {
  return {
    ORDER_NO: 'ORD-2024-001',
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

describe('transformOrder (Ecount)', () => {
  it('maps core fields correctly', () => {
    const result = transformOrder(makeRaw())
    expect(result.id).toBe('ORD-2024-001')
    expect(result.contactId).toBe('CUST-001')
    expect(result.totalAmount).toBe(110000)
    expect(result.type).toBe('SALES')
  })

  it('parses date as Date object', () => {
    const result = transformOrder(makeRaw())
    expect(result.postedAt).toEqual(new Date('2024-01-15'))
  })

  it('maps STATUS 03 to COMPLETED', () => {
    const result = transformOrder(makeRaw({ STATUS: '03' }))
    expect(result.status).toBe('COMPLETED')
  })

  it('maps STATUS 04 to CANCELLED', () => {
    const result = transformOrder(makeRaw({ STATUS: '04' }))
    expect(result.status).toBe('CANCELLED')
  })

  it('maps other status to ACTIVE', () => {
    const result = transformOrder(makeRaw({ STATUS: '01' }))
    expect(result.status).toBe('ACTIVE')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    const result = transformOrder(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrder(makeRaw())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})
