import { describe, it, expect } from 'vitest'
import { transformLocation } from '../../../../../../../src/verticals/inventory/adapters/picqer/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/inventory/schema/location'

describe('transformLocation — picqer warehouse', () => {
  const raw = {
    idwarehouse: 3,
    name: 'Amsterdam Warehouse',
    accept_orders: true,
    counts_for_general_stock: true,
    priority: 1,
    active: true,
  }
  const result = transformLocation(raw)

  it('sets id from idwarehouse as string', () => {
    expect(result.id).toBe('3')
  })

  it('sets externalId matching id', () => {
    expect(result.externalId).toBe('3')
  })

  it('sets name from raw.name', () => {
    expect(result.name).toBe('Amsterdam Warehouse')
  })

  it('sets type to warehouse', () => {
    expect(result.type).toBe('warehouse')
  })

  it('sets isActive from raw.active', () => {
    expect(result.isActive).toBe(true)
  })

  it('sets platform to picqer', () => {
    expect(result.platform).toBe('picqer')
  })

  it('stores accept_orders in metadata', () => {
    expect(result.metadata['accept_orders']).toBe('true')
  })

  it('stores counts_for_general_stock in metadata', () => {
    expect(result.metadata['counts_for_general_stock']).toBe('true')
  })

  it('passes schema validation', () => {
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})

describe('transformLocation — inactive warehouse', () => {
  const result = transformLocation({
    idwarehouse: 9,
    name: 'Closed Depot',
    accept_orders: false,
    counts_for_general_stock: false,
    active: false,
  })

  it('sets isActive to false', () => {
    expect(result.isActive).toBe(false)
  })

  it('defaults isActive to true when active is undefined', () => {
    const r = transformLocation({
      idwarehouse: 8,
      name: 'X',
      accept_orders: false,
      counts_for_general_stock: false,
    })
    expect(r.isActive).toBe(true)
  })

  it('passes schema validation', () => {
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})
