import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  type RawItemitLocation,
} from '../../../../../../../src/verticals/inventory/adapters/itemit/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/inventory/schema/location'

describe('transformLocation — itemit warehouse', () => {
  const raw: RawItemitLocation = {
    id: 'loc-abc-001',
    name: 'Main Warehouse',
    type: 'warehouse',
    colour: '#FF0000',
    createdAt: '2024-03-01T00:00:00Z',
    workspace: 'ws-001',
    _itemCount: 42,
  }
  const result = transformLocation(raw)

  it('sets id from id', () => {
    expect(result.id).toBe('loc-abc-001')
  })

  it('sets name from name', () => {
    expect(result.name).toBe('Main Warehouse')
  })

  it('maps type warehouse → warehouse', () => {
    expect(result.type).toBe('warehouse')
  })

  it('sets isActive to true', () => {
    expect(result.isActive).toBe(true)
  })

  it('sets platform to itemit', () => {
    expect(result.platform).toBe('itemit')
  })

  it('passes schema validation', () => {
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})

describe('transformLocation — itemit type mapping', () => {
  const makeRaw = (type: string): RawItemitLocation => ({
    id: 'loc-type-test',
    name: 'Test',
    type,
  })

  it('maps store → store', () => {
    expect(transformLocation(makeRaw('store')).type).toBe('store')
  })

  it('maps virtual → virtual', () => {
    expect(transformLocation(makeRaw('virtual')).type).toBe('virtual')
  })

  it('maps transit → transit', () => {
    expect(transformLocation(makeRaw('transit')).type).toBe('transit')
  })

  it('maps supplier → supplier', () => {
    expect(transformLocation(makeRaw('supplier')).type).toBe('supplier')
  })

  it('maps unknown type → unknown', () => {
    expect(transformLocation(makeRaw('rooftop')).type).toBe('unknown')
  })
})

describe('transformLocation — created.at.timestamp fallback', () => {
  const raw: RawItemitLocation = {
    id: 'loc-fallback',
    name: 'Depot',
    type: 'depot',
    created: {
      at: { timestamp: '2024-03-01T00:00:00Z' },
      by: { id: 'user-1', name: 'Alice', type: 'user' },
    },
  }
  const result = transformLocation(raw)

  it('maps depot → warehouse', () => {
    expect(result.type).toBe('warehouse')
  })

  it('passes schema validation', () => {
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})
