import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  type RawPeoplevoxSite,
} from '../../../../../../../src/verticals/inventory/adapters/peoplevox/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/inventory/schema/location'

describe('transformLocation — peoplevox', () => {
  const raw: RawPeoplevoxSite = {
    Name: 'Main Warehouse',
    Reference: 'WH-001',
  }
  const result = transformLocation(raw)

  it('maps id from Reference', () => {
    expect(result.id).toBe('WH-001')
  })

  it('maps externalId from Reference', () => {
    expect(result.externalId).toBe('WH-001')
  })

  it('maps name from Name', () => {
    expect(result.name).toBe('Main Warehouse')
  })

  it('maps code from Reference', () => {
    expect(result.code).toBe('WH-001')
  })

  it('hardcodes type to warehouse', () => {
    expect(result.type).toBe('warehouse')
  })

  it('hardcodes isActive to true', () => {
    expect(result.isActive).toBe(true)
  })

  it('sets platform to peoplevox', () => {
    expect(result.platform).toBe('peoplevox')
  })

  it('passes schema validation', () => {
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})

describe('transformLocation — peoplevox fallback when Reference absent', () => {
  const raw: RawPeoplevoxSite = {
    Name: 'Secondary Site',
  }
  const result = transformLocation(raw)

  it('falls back to Name for id when Reference absent', () => {
    expect(result.id).toBe('Secondary Site')
  })

  it('leaves code undefined when Reference absent', () => {
    expect(result.code).toBeUndefined()
  })

  it('passes schema validation', () => {
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})
