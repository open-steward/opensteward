import { describe, it, expect } from 'vitest'
import {
  transformSupplier,
  type RawOpenboxesSupplier,
} from '../../../../../../../src/verticals/inventory/adapters/openboxes/transform/supplier'
import { SupplierSchema } from '../../../../../../../src/verticals/inventory/schema/supplier'

describe('openboxes transformSupplier', () => {
  const raw: RawOpenboxesSupplier = {
    id: 'sup-001',
    name: 'Keyboards Inc',
    code: 'KBD',
    description: 'Peripheral supplier',
    locationTypeCode: 'SUPPLIER',
  }

  it('maps id and externalId', () => {
    const result = transformSupplier(raw)
    expect(result.id).toBe('sup-001')
    expect(result.externalId).toBe('sup-001')
  })

  it('maps name', () => {
    const result = transformSupplier(raw)
    expect(result.name).toBe('Keyboards Inc')
  })

  it('sets isActive to true', () => {
    const result = transformSupplier(raw)
    expect(result.isActive).toBe(true)
  })

  it('sets platform to openboxes', () => {
    const result = transformSupplier(raw)
    expect(result.platform).toBe('openboxes')
  })

  it('stores code and description in metadata', () => {
    const result = transformSupplier(raw)
    expect(result.metadata.code).toBe('KBD')
    expect(result.metadata.description).toBe('Peripheral supplier')
  })

  it('produces output that satisfies SupplierSchema', () => {
    const result = transformSupplier(raw)
    expect(() => SupplierSchema.parse(result)).not.toThrow()
  })
})
