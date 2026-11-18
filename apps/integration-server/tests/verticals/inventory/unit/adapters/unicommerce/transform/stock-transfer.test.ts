import { describe, it, expect } from 'vitest'
import {
  transformStockTransfer,
  type RawUnicommerceGatepass,
  type RawUnicommerceGatepassItem,
} from '../../../../../../../src/verticals/inventory/adapters/unicommerce/transform/stock-transfer'
import { StockTransferSchema } from '../../../../../../../src/verticals/inventory/schema/stock-transfer'

function makeItem(overrides: Partial<RawUnicommerceGatepassItem> = {}): RawUnicommerceGatepassItem {
  return {
    itemCode: 'ITEM-CODE-1',
    itemTypeSKU: 'SKU-001',
    itemTypeName: 'Widget',
    quantity: 50,
    receivedQuantity: 50,
    pendingQuantity: 0,
    unitPrice: 250,
    inventoryType: 'GOOD',
    shelfCode: 'SHELF-A1',
    ...overrides,
  }
}

function makeRaw(overrides: Partial<RawUnicommerceGatepass> = {}): RawUnicommerceGatepass {
  return {
    id: 7,
    code: 'GP-2024-001',
    statusCode: 'CREATED',
    type: 'STOCK_TRANSFER',
    invoiceCode: 'INV-001',
    toPartyName: 'WH-MUMBAI',
    reference: 'REF-001',
    purpose: 'TRANSFER',
    created: '2024-03-01T00:00:00Z',
    updated: '2024-03-15T00:00:00Z',
    gatePassItemDTOs: [makeItem()],
    fromFacilityCode: 'WH-DELHI',
    ...overrides,
  }
}

describe('transformStockTransfer (unicommerce)', () => {
  it('maps id and externalId from code', () => {
    const result = transformStockTransfer(makeRaw({ code: 'GP-2024-001' }))
    expect(result.id).toBe('GP-2024-001')
    expect(result.externalId).toBe('GP-2024-001')
  })

  it('falls back id to stringified numeric id when code is absent', () => {
    const result = transformStockTransfer(makeRaw({ code: undefined, id: 7 }))
    expect(result.id).toBe('7')
  })

  it('maps number from code', () => {
    const result = transformStockTransfer(makeRaw({ code: 'GP-2024-001' }))
    expect(result.number).toBe('GP-2024-001')
  })

  it('maps fromLocationId from fromFacilityCode', () => {
    const result = transformStockTransfer(makeRaw({ fromFacilityCode: 'WH-DELHI' }))
    expect(result.fromLocationId).toBe('WH-DELHI')
  })

  it('maps toLocationId from toPartyName', () => {
    const result = transformStockTransfer(makeRaw({ toPartyName: 'WH-MUMBAI' }))
    expect(result.toLocationId).toBe('WH-MUMBAI')
  })

  describe('status mapping', () => {
    it.each([
      ['CREATED', 'draft'],
      ['RETURN_AWAITED', 'in_transit'],
      ['CLOSED', 'completed'],
      ['DISCARDED', 'cancelled'],
      ['UNKNOWN', 'draft'],
    ] as const)('maps statusCode %s → %s', (statusCode, expected) => {
      const result = transformStockTransfer(makeRaw({ statusCode }))
      expect(result.status).toBe(expected)
    })
  })

  it('maps shippedAt from created field', () => {
    const result = transformStockTransfer(makeRaw({ created: '2024-03-01T00:00:00Z' }))
    expect(result.shippedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('maps receivedAt from updated only when statusCode is CLOSED', () => {
    const result = transformStockTransfer(
      makeRaw({ statusCode: 'CLOSED', updated: '2024-03-15T00:00:00Z' }),
    )
    expect(result.receivedAt).toBe('2024-03-15T00:00:00.000Z')
  })

  it('omits receivedAt when statusCode is not CLOSED', () => {
    const result = transformStockTransfer(
      makeRaw({ statusCode: 'RETURN_AWAITED', updated: '2024-03-15T00:00:00Z' }),
    )
    expect(result.receivedAt).toBeUndefined()
  })

  describe('line items', () => {
    it('maps productId from itemTypeSKU (preferred over itemCode)', () => {
      const result = transformStockTransfer(
        makeRaw({
          gatePassItemDTOs: [makeItem({ itemTypeSKU: 'SKU-001', itemCode: 'ITEM-CODE-1' })],
        }),
      )
      expect(result.lines[0]!.productId).toBe('SKU-001')
    })

    it('falls back productId to itemCode when itemTypeSKU is absent', () => {
      const result = transformStockTransfer(
        makeRaw({
          gatePassItemDTOs: [makeItem({ itemTypeSKU: undefined, itemCode: 'ITEM-CODE-1' })],
        }),
      )
      expect(result.lines[0]!.productId).toBe('ITEM-CODE-1')
    })

    it('maps quantity from line quantity', () => {
      const result = transformStockTransfer(makeRaw())
      expect(result.lines[0]!.quantity).toBe(50)
    })

    it('maps quantityReceived from receivedQuantity', () => {
      const result = transformStockTransfer(makeRaw())
      expect(result.lines[0]!.quantityReceived).toBe(50)
    })

    it('returns empty lines array when gatePassItemDTOs is absent', () => {
      const result = transformStockTransfer(makeRaw({ gatePassItemDTOs: undefined }))
      expect(result.lines).toEqual([])
    })
  })

  it('platform is "unicommerce"', () => {
    expect(transformStockTransfer(makeRaw()).platform).toBe('unicommerce')
  })

  it('passes StockTransferSchema validation', () => {
    const result = transformStockTransfer(makeRaw())
    expect(() => StockTransferSchema.parse(result)).not.toThrow()
  })
})
