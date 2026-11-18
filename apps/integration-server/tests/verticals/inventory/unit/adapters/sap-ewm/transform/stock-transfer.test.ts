import { describe, it, expect } from 'vitest'
import {
  transformStockTransfer,
  type RawSapEwmWarehouseTask,
} from '../../../../../../../src/verticals/inventory/adapters/sap-ewm/transform/stock-transfer'
import { StockTransferSchema } from '../../../../../../../src/verticals/inventory/schema/stock-transfer'

describe('sap-ewm transformStockTransfer', () => {
  const raw: RawSapEwmWarehouseTask = {
    WarehouseNumber: 'WH01',
    WarehouseOrder: 'WO-001',
    WarehouseTask: 'WT-001',
    Product: 'MAT-001',
    EWMSrcStorageType: 'HIGH',
    EWMSrcStorageBin: 'A-01-01',
    EWMDestStorageType: 'BULK',
    EWMDestStorageBin: 'B-02-03',
    RequestedQuantity: 20,
    ActualQuantity: 0,
    ConfirmationStatus: 'A',
    CreationDateTime: '2024-03-01T00:00:00Z',
    ConfirmationDateTime: '2024-03-01T00:00:00Z',
  }

  it('maps id as WarehouseNumber:WarehouseOrder:WarehouseTask', () => {
    const result = transformStockTransfer(raw)
    expect(result.id).toBe('WH01:WO-001:WT-001')
  })

  it('maps number from WarehouseOrder', () => {
    const result = transformStockTransfer(raw)
    expect(result.number).toBe('WO-001')
  })

  it('maps fromLocationId as WarehouseNumber:SrcStorageType:SrcStorageBin', () => {
    const result = transformStockTransfer(raw)
    expect(result.fromLocationId).toBe('WH01:HIGH:A-01-01')
  })

  it('fromLocationId falls back to WarehouseNumber when src bin absent', () => {
    const result = transformStockTransfer({ ...raw, EWMSrcStorageBin: undefined })
    expect(result.fromLocationId).toBe('WH01')
  })

  it('maps toLocationId as WarehouseNumber:DestStorageType:DestStorageBin', () => {
    const result = transformStockTransfer(raw)
    expect(result.toLocationId).toBe('WH01:BULK:B-02-03')
  })

  it('ConfirmationStatus "A" → status in_transit', () => {
    const result = transformStockTransfer(raw)
    expect(result.status).toBe('in_transit')
  })

  it('ConfirmationStatus "B" → status completed', () => {
    const result = transformStockTransfer({ ...raw, ConfirmationStatus: 'B' })
    expect(result.status).toBe('completed')
  })

  it('ConfirmationStatus "C" → status cancelled', () => {
    const result = transformStockTransfer({ ...raw, ConfirmationStatus: 'C' })
    expect(result.status).toBe('cancelled')
  })

  it('receivedAt only set when status is completed', () => {
    const inTransit = transformStockTransfer(raw)
    expect(inTransit.receivedAt).toBeUndefined()

    const completed = transformStockTransfer({ ...raw, ConfirmationStatus: 'B' })
    expect(completed.receivedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('maps lines with product and quantity', () => {
    const result = transformStockTransfer(raw)
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0].productId).toBe('MAT-001')
    expect(result.lines[0].quantity).toBe(20)
  })

  it('maps shippedAt from CreationDateTime', () => {
    const result = transformStockTransfer(raw)
    expect(result.shippedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('platform is sap-ewm', () => {
    const result = transformStockTransfer(raw)
    expect(result.platform).toBe('sap-ewm')
  })

  it('produces output satisfying StockTransferSchema', () => {
    const result = transformStockTransfer(raw)
    expect(() => StockTransferSchema.parse(result)).not.toThrow()
  })
})
