import { describe, it, expect } from 'vitest'
import { OrderSchema } from '../../../../../../../src/verticals/accounting/schema/order'
import {
  transformOrder,
  type AutocountOrder,
} from '../../../../../../../src/verticals/accounting/adapters/autocount/transform/order'

function makeRaw(overrides: Partial<AutocountOrder> = {}): AutocountOrder {
  return {
    DocNo: 'SO-001',
    DocDate: '2024-03-05',
    DueDate: '2024-04-05',
    SubTotal: 1500,
    TaxAmt: 90,
    DocAmt: 1590,
    DebtorCode: 'D001',
    DebtorName: 'Acme Sdn Bhd',
    Cancelled: false,
    Status: 0,
    DetailItems: [],
    ...overrides,
  }
}

describe('transformOrder (autocount)', () => {
  it('maps core fields correctly', () => {
    const result = transformOrder(makeRaw())
    expect(result.id).toBe('SO-001')
    expect(result.contactId).toBe('D001')
    expect(result.totalAmount).toBe(1590)
    expect(result.type).toBe('SALES')
  })

  it('parses date as Date object', () => {
    const result = transformOrder(makeRaw())
    expect(result.postedAt).toEqual(new Date('2024-03-05'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    const result = transformOrder(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps Status 0 (open) to ACTIVE', () => {
    const result = transformOrder(makeRaw({ Status: 0 }))
    expect(result.status).toBe('ACTIVE')
  })

  it('maps Status 2 (closed) to COMPLETED', () => {
    const result = transformOrder(makeRaw({ Status: 2 }))
    expect(result.status).toBe('COMPLETED')
  })

  it('maps Cancelled to CANCELLED', () => {
    const result = transformOrder(makeRaw({ Cancelled: true }))
    expect(result.status).toBe('CANCELLED')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrder(makeRaw())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})
