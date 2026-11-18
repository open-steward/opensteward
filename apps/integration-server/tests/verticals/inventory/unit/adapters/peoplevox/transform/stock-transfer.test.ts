import { describe, it, expect } from 'vitest'
import {
  transformStockTransfer,
  type RawPeoplevoxItemMovement,
} from '../../../../../../../src/verticals/inventory/adapters/peoplevox/transform/stock-transfer'
import { StockTransferSchema } from '../../../../../../../src/verticals/inventory/schema/stock-transfer'

describe('transformStockTransfer — peoplevox', () => {
  const raw: RawPeoplevoxItemMovement = {
    History_Id: 'MV-001',
    Item_code: 'WK-2026',
    Item_name: 'Wireless Keyboard',
    Date_timestamp: '2024-03-01T00:00:00Z',
    User: 'jane.doe',
    From: 'WH-EAST',
    To: 'WH-WEST',
    Quantity: '25',
    Comments: 'Regular inter-site transfer',
    Site_reference: 'SITE-A',
  }
  const result = transformStockTransfer(raw)

  it('maps id from History_Id', () => {
    expect(result.id).toBe('MV-001')
  })

  it('maps number from History_Id', () => {
    expect(result.number).toBe('MV-001')
  })

  it('maps fromLocationId from From', () => {
    expect(result.fromLocationId).toBe('WH-EAST')
  })

  it('maps toLocationId from To', () => {
    expect(result.toLocationId).toBe('WH-WEST')
  })

  it('maps status completed when both From and To are present', () => {
    expect(result.status).toBe('completed')
  })

  it('maps line productId from Item_code', () => {
    expect(result.lines[0]!.productId).toBe('WK-2026')
  })

  it('maps line quantity from Quantity string', () => {
    expect(result.lines[0]!.quantity).toBe(25)
  })

  it('maps shippedAt from Date_timestamp via toIso', () => {
    expect(result.shippedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('maps receivedAt from Date_timestamp via toIso', () => {
    expect(result.receivedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('sets platform to peoplevox', () => {
    expect(result.platform).toBe('peoplevox')
  })

  it('stores comments in metadata', () => {
    expect(result.metadata['comments']).toBe('Regular inter-site transfer')
  })

  it('passes schema validation', () => {
    expect(() => StockTransferSchema.parse(result)).not.toThrow()
  })
})

describe('transformStockTransfer — peoplevox draft status when To absent', () => {
  const raw: RawPeoplevoxItemMovement = {
    History_Id: 'MV-002',
    Item_code: 'SKU-A',
    Date_timestamp: '2024-03-01T00:00:00Z',
    From: 'WH-EAST',
    Quantity: '10',
  }
  const result = transformStockTransfer(raw)

  it('maps status draft when To is absent', () => {
    expect(result.status).toBe('draft')
  })

  it('maps empty toLocationId string when To absent', () => {
    expect(result.toLocationId).toBe('')
  })

  it('passes schema validation', () => {
    expect(() => StockTransferSchema.parse(result)).not.toThrow()
  })
})

describe('transformStockTransfer — peoplevox fallbacks', () => {
  it('builds synthetic id from Item_code and Date_timestamp when History_Id absent', () => {
    const raw: RawPeoplevoxItemMovement = {
      Item_code: 'SKU-B',
      Date_timestamp: '2024-03-01T00:00:00Z',
      From: 'WH-A',
      To: 'WH-B',
      Quantity: '1',
    }
    const result = transformStockTransfer(raw)
    expect(result.id).toBe('SKU-B:2024-03-01T00:00:00Z')
  })

  it('produces empty lines when Item_code absent', () => {
    const raw: RawPeoplevoxItemMovement = {
      History_Id: 'MV-003',
      Date_timestamp: '2024-03-01T00:00:00Z',
      From: 'WH-A',
      To: 'WH-B',
      Quantity: '0',
    }
    const result = transformStockTransfer(raw)
    expect(result.lines).toEqual([])
  })
})
