import { describe, it, expect } from 'vitest'
import {
  transformStockTransfer,
  type RawOpenbravoInternalMovement,
} from '../../../../../../../src/verticals/inventory/adapters/openbravo/transform/stock-transfer'
import { StockTransferSchema } from '../../../../../../../src/verticals/inventory/schema/stock-transfer'

describe('openbravo transformStockTransfer', () => {
  const raw: RawOpenbravoInternalMovement = {
    id: 'mov-uuid-001',
    documentNo: 'MOV-2024-001',
    documentStatus: 'CO',
    movementDate: '2024-03-01T00:00:00Z',
    processDate: '2024-03-01T00:00:00Z',
    internalMovementLineList: [
      {
        id: 'ml-001',
        product: { id: 'prod-001' },
        storagebin: { id: 'bin-001', warehouse: { id: 'wh-001' } },
        newStorageBin: { id: 'bin-002', warehouse: { id: 'wh-002' } },
        movementQty: 50,
        quantityReceived: 50,
      },
    ],
  }

  it('maps id and externalId', () => {
    const result = transformStockTransfer(raw)
    expect(result.id).toBe('mov-uuid-001')
    expect(result.externalId).toBe('mov-uuid-001')
  })

  it('maps number from documentNo', () => {
    const result = transformStockTransfer(raw)
    expect(result.number).toBe('MOV-2024-001')
  })

  it('derives fromLocationId from first line storagebin.id', () => {
    const result = transformStockTransfer(raw)
    expect(result.fromLocationId).toBe('bin-001')
  })

  it('derives toLocationId from first line newStorageBin.id', () => {
    const result = transformStockTransfer(raw)
    expect(result.toLocationId).toBe('bin-002')
  })

  it('maps CO documentStatus to completed', () => {
    const result = transformStockTransfer(raw)
    expect(result.status).toBe('completed')
  })

  it('maps DR documentStatus to draft', () => {
    const result = transformStockTransfer({ ...raw, documentStatus: 'DR' })
    expect(result.status).toBe('draft')
  })

  it('maps VO documentStatus to cancelled', () => {
    const result = transformStockTransfer({ ...raw, documentStatus: 'VO' })
    expect(result.status).toBe('cancelled')
  })

  it('maps line items', () => {
    const result = transformStockTransfer(raw)
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0]!.productId).toBe('prod-001')
    expect(result.lines[0]!.quantity).toBe(50)
    expect(result.lines[0]!.quantityReceived).toBe(50)
  })

  it('maps shippedAt from movementDate', () => {
    const result = transformStockTransfer(raw)
    expect(result.shippedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('maps receivedAt from processDate', () => {
    const result = transformStockTransfer(raw)
    expect(result.receivedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('sets platform to openbravo', () => {
    const result = transformStockTransfer(raw)
    expect(result.platform).toBe('openbravo')
  })

  it('produces output that satisfies StockTransferSchema', () => {
    const result = transformStockTransfer(raw)
    expect(() => StockTransferSchema.parse(result)).not.toThrow()
  })
})
