import { describe, it, expect } from 'vitest'
import {
  transformStockTransfer,
  type RawVarioStockJournalEntry,
} from '../../../../../../../src/verticals/inventory/adapters/vario-software/transform/stock-transfer'
import { StockTransferSchema } from '../../../../../../../src/verticals/inventory/schema/stock-transfer'

const baseRaw: RawVarioStockJournalEntry = {
  id: 'jrn-001',
  articleId: 'art-001',
  storageBinId: 'bin-007',
  quantity: 25,
  factor: 'INCREMENT',
  valueDate: '2024-03-01T00:00:00Z',
  type: 'DOCUMENT',
  documentNumber: 'DOC-2024-001',
  documentType: 'OUTBOUND',
}

describe('vario-software transformStockTransfer', () => {
  it('maps id from id field', () => {
    expect(transformStockTransfer(baseRaw).id).toBe('jrn-001')
  })

  it('maps number from documentNumber', () => {
    expect(transformStockTransfer(baseRaw).number).toBe('DOC-2024-001')
  })

  it('sets toLocationId from storageBinId when INCREMENT', () => {
    const result = transformStockTransfer(baseRaw)
    expect(result.toLocationId).toBe('bin-007')
    expect(result.fromLocationId).toBe('')
  })

  it('sets fromLocationId from storageBinId when DECREMENT', () => {
    const result = transformStockTransfer({ ...baseRaw, factor: 'DECREMENT' })
    expect(result.fromLocationId).toBe('bin-007')
    expect(result.toLocationId).toBe('')
  })

  it('maps status to in_transit for PICKING type', () => {
    const result = transformStockTransfer({ ...baseRaw, type: 'PICKING' })
    expect(result.status).toBe('in_transit')
  })

  it('maps status to completed for DOCUMENT type', () => {
    expect(transformStockTransfer(baseRaw).status).toBe('completed')
  })

  it('maps line productId from articleId', () => {
    const result = transformStockTransfer(baseRaw)
    expect(result.lines[0]!.productId).toBe('art-001')
    expect(result.lines[0]!.quantity).toBe(25)
  })

  it('maps shippedAt and receivedAt from valueDate', () => {
    const result = transformStockTransfer(baseRaw)
    expect(result.shippedAt).toBe('2024-03-01T00:00:00.000Z')
    expect(result.receivedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('sets platform to vario-software', () => {
    expect(transformStockTransfer(baseRaw).platform).toBe('vario-software')
  })

  it('produces output that satisfies StockTransferSchema', () => {
    expect(() => StockTransferSchema.parse(transformStockTransfer(baseRaw))).not.toThrow()
  })
})
