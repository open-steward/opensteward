import { describe, it, expect } from 'vitest'
import {
  transformStockTransfer,
  type RawOngoingWmsMovement,
} from '../../../../../../../src/verticals/inventory/adapters/ongoing-wms/transform/stock-transfer'
import { StockTransferSchema } from '../../../../../../../src/verticals/inventory/schema/stock-transfer'

describe('ongoing-wms transformStockTransfer', () => {
  const raw: RawOngoingWmsMovement = {
    movementId: 501,
    articleNumber: 'ART-001',
    articleSystemId: 18068,
    numberOfItems: 50,
    fromLocationName: 'Zone A',
    toLocationName: 'Zone B',
    fromWarehouseId: 10,
    toWarehouseId: 20,
    moveTime: '2024-03-01T00:00:00Z',
  }

  it('maps id and externalId from movementId', () => {
    const result = transformStockTransfer(raw)
    expect(result.id).toBe('501')
    expect(result.externalId).toBe('501')
  })

  it('maps fromLocationId from fromWarehouseId', () => {
    const result = transformStockTransfer(raw)
    expect(result.fromLocationId).toBe('10')
  })

  it('maps toLocationId from toWarehouseId', () => {
    const result = transformStockTransfer(raw)
    expect(result.toLocationId).toBe('20')
  })

  it('always sets status to completed (movements are completed events)', () => {
    const result = transformStockTransfer(raw)
    expect(result.status).toBe('completed')
  })

  it('maps lines with productId from articleSystemId', () => {
    const result = transformStockTransfer(raw)
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0]!.productId).toBe('18068')
    expect(result.lines[0]!.quantity).toBe(50)
  })

  it('maps receivedAt from moveTime', () => {
    const result = transformStockTransfer(raw)
    expect(result.receivedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('sets platform to ongoing-wms', () => {
    const result = transformStockTransfer(raw)
    expect(result.platform).toBe('ongoing-wms')
  })

  it('falls back to location names when warehouse IDs are absent', () => {
    const result = transformStockTransfer({
      ...raw,
      fromWarehouseId: undefined,
      toWarehouseId: undefined,
    })
    expect(result.fromLocationId).toBe('Zone A')
    expect(result.toLocationId).toBe('Zone B')
  })

  it('produces output that satisfies StockTransferSchema', () => {
    const result = transformStockTransfer(raw)
    expect(() => StockTransferSchema.parse(result)).not.toThrow()
  })
})
