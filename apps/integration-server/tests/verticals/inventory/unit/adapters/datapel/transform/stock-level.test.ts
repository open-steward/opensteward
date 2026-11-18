import { describe, it, expect } from 'vitest'
import {
  transformStockLevel,
  type RawDatapelInventory,
} from '../../../../../../../src/verticals/inventory/adapters/datapel/transform/stock-level'
import { StockLevelSchema } from '../../../../../../../src/verticals/inventory/schema/stock-level'

describe('datapel transformStockLevel', () => {
  const raw: RawDatapelInventory = {
    basestockid: 101,
    itemnumber: 'WIDGET-001',
    itemname: 'Blue Widget',
    locationid: 42,
    quantity: 250,
    availqty: 230,
    committed: 20,
    onorder: 100,
    intransitqty: 10,
    allocatedqty: 5,
    onhold: 0,
  }

  it('builds composite id from basestockid and locationid', () => {
    const result = transformStockLevel(raw)
    expect(result.id).toBe('101:42')
  })

  it('maps productId from basestockid', () => {
    const result = transformStockLevel(raw)
    expect(result.productId).toBe('101')
  })

  it('maps locationId from locationid', () => {
    const result = transformStockLevel(raw)
    expect(result.locationId).toBe('42')
  })

  it('maps quantityOnHand from quantity', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityOnHand).toBe(250)
  })

  it('maps quantityAvailable from availqty', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityAvailable).toBe(230)
  })

  it('maps quantityCommitted from committed', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityCommitted).toBe(20)
  })

  it('maps quantityIncoming from onorder', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityIncoming).toBe(100)
  })

  it('defaults quantityOnHand to 0 when quantity is absent', () => {
    const result = transformStockLevel({ basestockid: 999, locationid: 1 })
    expect(result.quantityOnHand).toBe(0)
  })

  it('handles string quantity values', () => {
    const result = transformStockLevel({ ...raw, quantity: '75' })
    expect(result.quantityOnHand).toBe(75)
  })

  it('sets platform to datapel', () => {
    const result = transformStockLevel(raw)
    expect(result.platform).toBe('datapel')
  })

  it('produces output that satisfies StockLevelSchema', () => {
    const result = transformStockLevel(raw)
    expect(() => StockLevelSchema.parse(result)).not.toThrow()
  })
})
