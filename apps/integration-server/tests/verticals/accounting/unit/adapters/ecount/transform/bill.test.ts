import { describe, it, expect } from 'vitest'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'
import {
  transformBill,
  type EcountBill,
} from '../../../../../../../src/verticals/accounting/adapters/ecount/transform/bill'

function makeRaw(overrides: Partial<EcountBill> = {}): EcountBill {
  return {
    SLIP_NO: 'PU-2024-001',
    IO_DATE: '2024-01-10',
    DUE_DATE: '2024-02-10',
    CUST_CODE: 'VEND-001',
    CUST_NAME: 'Supplier Korea Co',
    SUPPLY_AMT: 50000,
    VAT_AMT: 5000,
    TOTAL_AMT: 55000,
    UNPAID_AMT: 55000,
    STATUS: '02',
    CRNC_CODE: 'KRW',
    ITEM_LIST: [],
    ...overrides,
  }
}

describe('transformBill (Ecount)', () => {
  it('maps core fields correctly', () => {
    const result = transformBill(makeRaw())
    expect(result.id).toBe('PU-2024-001')
    expect(result.billNumber).toBe('PU-2024-001')
    expect(result.contactId).toBe('VEND-001')
    expect(result.totalAmount).toBe(55000)
    expect(result.taxAmount).toBe(5000)
    expect(result.balanceAmount).toBe(55000)
    expect(result.currency).toBe('KRW')
  })

  it('parses dates as Date objects', () => {
    const result = transformBill(makeRaw())
    expect(result.postedAt).toEqual(new Date('2024-01-10'))
    expect(result.dueAt).toEqual(new Date('2024-02-10'))
  })

  it('maps STATUS 01 to DRAFT', () => {
    const result = transformBill(makeRaw({ STATUS: '01' }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps STATUS 03 to PAID', () => {
    const result = transformBill(makeRaw({ STATUS: '03' }))
    expect(result.status).toBe('PAID')
  })

  it('maps STATUS 04 to VOIDED', () => {
    const result = transformBill(makeRaw({ STATUS: '04' }))
    expect(result.status).toBe('VOIDED')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    const result = transformBill(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformBill(makeRaw())
    expect(() => BillSchema.parse(result)).not.toThrow()
  })
})
