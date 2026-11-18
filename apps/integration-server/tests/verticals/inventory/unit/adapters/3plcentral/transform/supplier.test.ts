import { describe, it, expect } from 'vitest'
import { transformSupplier } from '../../../../../../../src/verticals/inventory/adapters/3plcentral/transform/supplier'
import { SupplierSchema } from '../../../../../../../src/verticals/inventory/schema/supplier'

describe('transformSupplier', () => {
  const raw = { id: 10, name: 'Acme Supplies' }
  const result = transformSupplier(raw)

  it('sets id from raw.id', () => {
    expect(result.id).toBe('10')
  })

  it('sets name', () => {
    expect(result.name).toBe('Acme Supplies')
  })

  it('sets platform to 3plcentral', () => {
    expect(result.platform).toBe('3plcentral')
  })

  it('sets isActive to true', () => {
    expect(result.isActive).toBe(true)
  })

  it('sets externalId matching id', () => {
    expect(result.externalId).toBe('10')
  })

  it('passes schema validation', () => {
    expect(() => SupplierSchema.parse(result)).not.toThrow()
  })
})

describe('transformSupplier — minimal input', () => {
  const result = transformSupplier({})

  it('sets id to empty string when id is missing', () => {
    expect(result.id).toBe('')
  })

  it('sets name to empty string when name is missing', () => {
    expect(result.name).toBe('')
  })

  it('passes schema validation', () => {
    expect(() => SupplierSchema.parse(result)).not.toThrow()
  })
})
