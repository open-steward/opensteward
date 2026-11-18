import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  type RawQoblexLocation,
} from '../../../../../../../src/verticals/inventory/adapters/qoblex/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/inventory/schema/location'

describe('qoblex transformLocation', () => {
  const raw: RawQoblexLocation = {
    id: 42,
    name: 'East Warehouse',
    available_in_purchase_orders: true,
  }

  it('stringifies numeric id', () => {
    const result = transformLocation(raw)
    expect(result.id).toBe('42')
    expect(result.externalId).toBe('42')
  })

  it('maps name and type to warehouse', () => {
    const result = transformLocation(raw)
    expect(result.name).toBe('East Warehouse')
    expect(result.type).toBe('warehouse')
  })

  it('always sets isActive to true', () => {
    const result = transformLocation(raw)
    expect(result.isActive).toBe(true)
  })

  it('stores available_in_purchase_orders in metadata', () => {
    const result = transformLocation(raw)
    expect(result.metadata['availableInPurchaseOrders']).toBe('true')
  })

  it('produces output that satisfies LocationSchema', () => {
    const result = transformLocation(raw)
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })

  it('handles missing optional fields', () => {
    const result = transformLocation({ id: 99 })
    expect(result.id).toBe('99')
    expect(result.name).toBe('')
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})
