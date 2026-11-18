import { describe, it, expect } from 'vitest'
import {
  transformSupplier,
  type RawQoblexSupplier,
} from '../../../../../../../src/verticals/inventory/adapters/qoblex/transform/supplier'
import { SupplierSchema } from '../../../../../../../src/verticals/inventory/schema/supplier'

describe('qoblex transformSupplier', () => {
  const raw: RawQoblexSupplier = {
    id: 55,
    name: 'KB Supplies Ltd',
  }

  it('stringifies numeric id', () => {
    const result = transformSupplier(raw)
    expect(result.id).toBe('55')
    expect(result.externalId).toBe('55')
  })

  it('maps name', () => {
    const result = transformSupplier(raw)
    expect(result.name).toBe('KB Supplies Ltd')
  })

  it('always sets isActive to true', () => {
    const result = transformSupplier(raw)
    expect(result.isActive).toBe(true)
  })

  it('sets platform to qoblex', () => {
    const result = transformSupplier(raw)
    expect(result.platform).toBe('qoblex')
  })

  it('sets name to empty string when name is absent', () => {
    const result = transformSupplier({ id: 1 })
    expect(result.name).toBe('')
  })

  it('produces output that satisfies SupplierSchema', () => {
    const result = transformSupplier(raw)
    expect(() => SupplierSchema.parse(result)).not.toThrow()
  })
})
