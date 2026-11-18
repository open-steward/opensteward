import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  type RawOrcaScanSheet,
} from '../../../../../../../src/verticals/inventory/adapters/orca-scan/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/inventory/schema/location'

describe('transformLocation — orca-scan', () => {
  const raw: RawOrcaScanSheet = {
    _id: 'sheet_abc123',
    name: 'Warehouse A',
    createdAt: '2024-03-01T00:00:00Z',
    updatedAt: '2024-03-01T00:00:00Z',
  }
  const result = transformLocation(raw)

  it('maps id from _id', () => {
    expect(result.id).toBe('sheet_abc123')
  })

  it('maps externalId from _id', () => {
    expect(result.externalId).toBe('sheet_abc123')
  })

  it('maps name from raw.name', () => {
    expect(result.name).toBe('Warehouse A')
  })

  it('hardcodes type to warehouse', () => {
    expect(result.type).toBe('warehouse')
  })

  it('hardcodes isActive to true', () => {
    expect(result.isActive).toBe(true)
  })

  it('sets platform to orca-scan', () => {
    expect(result.platform).toBe('orca-scan')
  })

  it('passes schema validation', () => {
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})

describe('transformLocation — orca-scan fallback when name absent', () => {
  const raw: RawOrcaScanSheet = {
    _id: 'sheet_fallback',
  }
  const result = transformLocation(raw)

  it('falls back to _id for name when name is absent', () => {
    expect(result.name).toBe('sheet_fallback')
  })

  it('passes schema validation', () => {
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})
