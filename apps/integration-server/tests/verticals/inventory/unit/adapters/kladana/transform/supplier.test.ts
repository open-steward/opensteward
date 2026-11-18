import { describe, it, expect } from 'vitest'
import {
  transformSupplier,
  type RawKladanaSupplier,
} from '../../../../../../../src/verticals/inventory/adapters/kladana/transform/supplier'
import { SupplierSchema } from '../../../../../../../src/verticals/inventory/schema/supplier'

describe('kladana transformSupplier', () => {
  const raw: RawKladanaSupplier = {
    id: 'sup-uuid-001',
    name: 'ООО Поставщик',
    email: 'info@supplier.ru',
    phone: '+7-495-123-4567',
    archived: false,
    companyType: 'legal',
    externalCode: 'SUP-EXT-001',
    created: '2024-03-01T00:00:00Z',
    updated: '2024-03-01T00:00:00Z',
  }

  it('maps id from raw.id', () => {
    const result = transformSupplier(raw)
    expect(result.id).toBe('sup-uuid-001')
    expect(result.externalId).toBe('sup-uuid-001')
  })

  it('maps name', () => {
    const result = transformSupplier(raw)
    expect(result.name).toBe('ООО Поставщик')
  })

  it('maps email', () => {
    const result = transformSupplier(raw)
    expect(result.email).toBe('info@supplier.ru')
  })

  it('maps phone', () => {
    const result = transformSupplier(raw)
    expect(result.phone).toBe('+7-495-123-4567')
  })

  it('sets isActive true when archived=false', () => {
    const result = transformSupplier(raw)
    expect(result.isActive).toBe(true)
  })

  it('sets isActive false when archived=true', () => {
    const result = transformSupplier({ ...raw, archived: true })
    expect(result.isActive).toBe(false)
  })

  it('defaults isActive to true when archived is missing', () => {
    const result = transformSupplier({ ...raw, archived: undefined })
    expect(result.isActive).toBe(true)
  })

  it('does not set defaultCurrency (not available on Kladana counterparties)', () => {
    const result = transformSupplier(raw)
    expect(result.defaultCurrency).toBeUndefined()
  })

  it('does not set defaultLeadTimeDays (not available on Kladana counterparties)', () => {
    const result = transformSupplier(raw)
    expect(result.defaultLeadTimeDays).toBeUndefined()
  })

  it('sets platform to kladana', () => {
    const result = transformSupplier(raw)
    expect(result.platform).toBe('kladana')
  })

  it('produces output that satisfies SupplierSchema', () => {
    expect(() => SupplierSchema.parse(transformSupplier(raw))).not.toThrow()
  })
})
