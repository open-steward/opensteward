import { describe, it, expect } from 'vitest'
import {
  transformStockTransfer,
  type RawStockTrimStockTransfer,
} from '../../../../../../../src/verticals/inventory/adapters/stocktrim/transform/stock-transfer'
import { StockTransferSchema } from '../../../../../../../src/verticals/inventory/schema/stock-transfer'

describe('transformStockTransfer — stocktrim', () => {
  const raw: RawStockTrimStockTransfer = {
    id: 'TRN-001',
    number: 'TR-1042',
    fromLocationCode: 'WH-SFO',
    toLocationCode: 'WH-NYC',
    status: 'InTransit',
    shippedAt: '2024-03-01T00:00:00Z',
    receivedAt: '2024-03-01T00:00:00Z',
    lines: [
      {
        productId: 'PROD-001',
        quantity: 50,
        quantityReceived: 50,
      },
    ],
  }
  const result = transformStockTransfer(raw)

  it('maps id', () => {
    expect(result.id).toBe('TRN-001')
  })

  it('maps number', () => {
    expect(result.number).toBe('TR-1042')
  })

  it('maps fromLocationId from fromLocationCode', () => {
    expect(result.fromLocationId).toBe('WH-SFO')
  })

  it('maps toLocationId from toLocationCode', () => {
    expect(result.toLocationId).toBe('WH-NYC')
  })

  it('maps status InTransit to in_transit', () => {
    expect(result.status).toBe('in_transit')
  })

  it('maps line productId', () => {
    expect(result.lines[0]?.productId).toBe('PROD-001')
  })

  it('maps line quantity', () => {
    expect(result.lines[0]?.quantity).toBe(50)
  })

  it('maps line quantityReceived', () => {
    expect(result.lines[0]?.quantityReceived).toBe(50)
  })

  it('maps shippedAt', () => {
    expect(result.shippedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('maps receivedAt', () => {
    expect(result.receivedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('sets platform to stocktrim', () => {
    expect(result.platform).toBe('stocktrim')
  })

  it('passes schema validation', () => {
    expect(() => StockTransferSchema.parse(result)).not.toThrow()
  })
})

describe('transformStockTransfer — stocktrim status mapping', () => {
  const base: RawStockTrimStockTransfer = {
    id: 'T1',
    fromLocationCode: 'L1',
    toLocationCode: 'L2',
  }

  it.each([
    ['draft', 'draft'],
    ['intransit', 'in_transit'],
    ['in_transit', 'in_transit'],
    ['shipped', 'in_transit'],
    ['completed', 'completed'],
    ['received', 'completed'],
    ['cancelled', 'cancelled'],
    ['void', 'cancelled'],
    ['unknown', 'draft'],
  ] as const)('maps status "%s" to "%s"', (status, expected) => {
    const result = transformStockTransfer({ ...base, status })
    expect(result.status).toBe(expected)
  })
})

describe('transformStockTransfer — stocktrim locationName fallback', () => {
  const raw: RawStockTrimStockTransfer = {
    id: 'TRN-FB',
    fromLocationName: 'Main WH',
    toLocationName: 'Remote WH',
    status: 'completed',
  }
  const result = transformStockTransfer(raw)

  it('falls back fromLocationId to fromLocationName', () => {
    expect(result.fromLocationId).toBe('Main WH')
  })

  it('falls back toLocationId to toLocationName', () => {
    expect(result.toLocationId).toBe('Remote WH')
  })
})
