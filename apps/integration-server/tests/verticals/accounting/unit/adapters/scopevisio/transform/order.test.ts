import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  type ScopevisioDispatch,
} from '../../../../../../../src/verticals/accounting/adapters/scopevisio/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/accounting/schema/order'

const EPOCH_MS = 1704067200000 // 2024-01-01T00:00:00.000Z

function makeRaw(overrides: Partial<ScopevisioDispatch> = {}): ScopevisioDispatch {
  return {
    id: 55,
    documentNumber: 'LS-2024-0055',
    status: 'DELIVERED',
    customerContactId: 8,
    currency: 'EUR',
    totalGross: 2500,
    totalVat: 400,
    documentDate: EPOCH_MS,
    positions: [
      {
        id: 1,
        name: 'Widget',
        quantity: 5,
        unitPrice: 420,
        totalGross: 2100,
        totalVat: 336,
        accountNumber: '4000',
      },
    ],
    ...overrides,
  }
}

describe('transformOrder (scopevisio)', () => {
  it('maps documentNumber to id', () => {
    expect(transformOrder(makeRaw()).id).toBe('LS-2024-0055')
  })

  it('sets type to SALES', () => {
    expect(transformOrder(makeRaw()).type).toBe('SALES')
  })

  it('maps customerContactId to contactId string', () => {
    expect(transformOrder(makeRaw()).contactId).toBe('8')
  })

  it('maps totalGross to totalAmount', () => {
    expect(transformOrder(makeRaw()).totalAmount).toBe(2500)
  })

  it('converts documentDate epoch ms to Date', () => {
    expect(transformOrder(makeRaw()).postedAt).toEqual(new Date(EPOCH_MS))
  })

  it('maps DELIVERED to COMPLETED', () => {
    expect(transformOrder(makeRaw({ status: 'DELIVERED' })).status).toBe('COMPLETED')
  })

  it('maps GELIEFERT to COMPLETED', () => {
    expect(transformOrder(makeRaw({ status: 'GELIEFERT' })).status).toBe('COMPLETED')
  })

  it('maps CANCELLED to CANCELLED', () => {
    expect(transformOrder(makeRaw({ status: 'CANCELLED' })).status).toBe('CANCELLED')
  })

  it('maps unknown status to ACTIVE', () => {
    expect(transformOrder(makeRaw({ status: 'PENDING' })).status).toBe('ACTIVE')
  })

  it('maps positions to lineItems', () => {
    const result = transformOrder(makeRaw())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].itemName).toBe('Widget')
    expect(result.lineItems![0].unitQuantity).toBe(5)
  })

  it('passes OrderSchema.parse without throwing', () => {
    expect(() => OrderSchema.parse(transformOrder(makeRaw()))).not.toThrow()
  })
})
