import { describe, it, expect } from 'vitest'
import { transformSupplier } from '../../../../../../../src/verticals/inventory/adapters/pickware/transform/supplier'
import { SupplierSchema } from '../../../../../../../src/verticals/inventory/schema/supplier'

describe('transformSupplier — pickware manufacturer', () => {
  const raw = {
    id: 10,
    name: 'Keyboards Inc',
    link: 'https://keyboards.example',
    description: 'Top keyboard supplier',
    metaTitle: 'Keyboards Inc SEO',
    metaKeywords: 'keyboards, peripherals',
    image: 'logo.png',
  }
  const result = transformSupplier(raw)

  it('sets id from raw.id as string', () => {
    expect(result.id).toBe('10')
  })

  it('sets externalId matching id', () => {
    expect(result.externalId).toBe('10')
  })

  it('sets name from raw.name', () => {
    expect(result.name).toBe('Keyboards Inc')
  })

  it('sets isActive to true (hardcoded — Pickware manufacturers always active)', () => {
    expect(result.isActive).toBe(true)
  })

  it('sets platform to pickware', () => {
    expect(result.platform).toBe('pickware')
  })

  it('stores link in metadata', () => {
    expect(result.metadata['link']).toBe('https://keyboards.example')
  })

  it('stores description in metadata', () => {
    expect(result.metadata['description']).toBe('Top keyboard supplier')
  })

  it('has no email (not available in Shopware 5 manufacturer API)', () => {
    expect(result.email).toBeUndefined()
  })

  it('has no phone (not available in Shopware 5 manufacturer API)', () => {
    expect(result.phone).toBeUndefined()
  })

  it('passes schema validation', () => {
    expect(() => SupplierSchema.parse(result)).not.toThrow()
  })
})

describe('transformSupplier — minimal input', () => {
  const result = transformSupplier({ id: 1 })

  it('sets id', () => {
    expect(result.id).toBe('1')
  })

  it('sets name to empty string when missing', () => {
    expect(result.name).toBe('')
  })

  it('passes schema validation', () => {
    expect(() => SupplierSchema.parse(result)).not.toThrow()
  })
})
