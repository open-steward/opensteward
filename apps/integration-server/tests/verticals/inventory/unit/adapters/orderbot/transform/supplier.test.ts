import { describe, it, expect } from 'vitest'
import {
  transformSupplier,
  type RawOrderbotSupplier,
} from '../../../../../../../src/verticals/inventory/adapters/orderbot/transform/supplier'
import { SupplierSchema } from '../../../../../../../src/verticals/inventory/schema/supplier'

describe('transformSupplier — orderbot', () => {
  const raw: RawOrderbotSupplier = {
    id: 42,
    name: 'Keyboards Inc',
    email: 'orders@keyboards.example',
    phone: '+14155550199',
    currency: 'USD',
    lead_time_days: 14,
    active: true,
    contact_name: 'Alice',
    website: 'https://keyboards.example',
  }
  const result = transformSupplier(raw)

  it('maps id from raw.id as string', () => {
    expect(result.id).toBe('42')
  })

  it('maps name from raw.name', () => {
    expect(result.name).toBe('Keyboards Inc')
  })

  it('maps email', () => {
    expect(result.email).toBe('orders@keyboards.example')
  })

  it('maps phone', () => {
    expect(result.phone).toBe('+14155550199')
  })

  it('maps defaultCurrency from currency', () => {
    expect(result.defaultCurrency).toBe('USD')
  })

  it('maps defaultLeadTimeDays from lead_time_days', () => {
    expect(result.defaultLeadTimeDays).toBe(14)
  })

  it('maps isActive from boolean active', () => {
    expect(result.isActive).toBe(true)
  })

  it('sets platform to orderbot', () => {
    expect(result.platform).toBe('orderbot')
  })

  it('stores contactName and website in metadata', () => {
    expect(result.metadata['contactName']).toBe('Alice')
    expect(result.metadata['website']).toBe('https://keyboards.example')
  })

  it('passes schema validation', () => {
    expect(() => SupplierSchema.parse(result)).not.toThrow()
  })
})

describe('transformSupplier — orderbot inactive via status', () => {
  const raw: RawOrderbotSupplier = {
    id: '99',
    name: 'Old Vendor',
    status: 'inactive',
  }
  const result = transformSupplier(raw)

  it('maps isActive false when status is inactive', () => {
    expect(result.isActive).toBe(false)
  })

  it('passes schema validation', () => {
    expect(() => SupplierSchema.parse(result)).not.toThrow()
  })
})

describe('transformSupplier — orderbot lead_time fallback', () => {
  const raw: RawOrderbotSupplier = {
    id: 5,
    name: 'Fast Supplier',
    lead_time: 7,
  }
  const result = transformSupplier(raw)

  it('falls back to lead_time when lead_time_days absent', () => {
    expect(result.defaultLeadTimeDays).toBe(7)
  })

  it('passes schema validation', () => {
    expect(() => SupplierSchema.parse(result)).not.toThrow()
  })
})
