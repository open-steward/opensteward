import { describe, it, expect } from 'vitest'
import {
  transformSalesOrder,
  type ScopevisioOffer,
} from '../../../../../../../src/verticals/accounting/adapters/scopevisio/transform/salesorder'
import { SalesOrderSchema } from '../../../../../../../src/verticals/accounting/schema/salesorder'

const EPOCH_MS = 1704067200000 // 2024-01-01T00:00:00.000Z

function makeRaw(overrides: Partial<ScopevisioOffer> = {}): ScopevisioOffer {
  return {
    id: 77,
    documentNumber: 'ANG-2024-0077',
    status: 'DRAFT',
    customerContactId: 3,
    currency: 'EUR',
    totalGross: 3570,
    totalNet: 3000,
    totalVat: 570,
    documentDate: EPOCH_MS,
    positions: [
      {
        id: 1,
        name: 'Proposal line',
        quantity: 3,
        unitPrice: 1000,
        totalGross: 3570,
        totalVat: 570,
        accountNumber: '8400',
      },
    ],
    ...overrides,
  }
}

describe('transformSalesOrder (scopevisio)', () => {
  it('maps documentNumber to id', () => {
    expect(transformSalesOrder(makeRaw()).id).toBe('ANG-2024-0077')
  })

  it('maps customerContactId to contactId string', () => {
    expect(transformSalesOrder(makeRaw()).contactId).toBe('3')
  })

  it('maps totalGross to totalAmount', () => {
    expect(transformSalesOrder(makeRaw()).totalAmount).toBe(3570)
  })

  it('maps currency', () => {
    expect(transformSalesOrder(makeRaw()).currency).toBe('EUR')
  })

  it('converts documentDate epoch ms to Date', () => {
    expect(transformSalesOrder(makeRaw()).postedAt).toEqual(new Date(EPOCH_MS))
  })

  it('maps DRAFT to DRAFT', () => {
    expect(transformSalesOrder(makeRaw({ status: 'DRAFT' })).status).toBe('DRAFT')
  })

  it('maps ENTWURF to DRAFT', () => {
    expect(transformSalesOrder(makeRaw({ status: 'ENTWURF' })).status).toBe('DRAFT')
  })

  it('maps ACCEPTED to COMPLETED', () => {
    expect(transformSalesOrder(makeRaw({ status: 'ACCEPTED' })).status).toBe('COMPLETED')
  })

  it('maps CANCELLED to CANCELLED', () => {
    expect(transformSalesOrder(makeRaw({ status: 'CANCELLED' })).status).toBe('CANCELLED')
  })

  it('maps positions to lineItems', () => {
    const result = transformSalesOrder(makeRaw())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].itemName).toBe('Proposal line')
    expect(result.lineItems![0].unitQuantity).toBe(3)
    expect(result.lineItems![0].accountId).toBe('8400')
  })

  it('passes SalesOrderSchema.parse without throwing', () => {
    expect(() => SalesOrderSchema.parse(transformSalesOrder(makeRaw()))).not.toThrow()
  })
})
