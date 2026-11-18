import { describe, it, expect } from 'vitest'
import { transformProvider } from '../../../../../../../src/verticals/logistics/adapters/kitchenhub/transform/carrier'
import { CarrierSchema } from '../../../../../../../src/verticals/logistics/schema/carrier'
import { documentedProvider } from '../fixtures/documented'

describe('kitchenhub transformProvider (ProviderGeneralInfoSerializer)', () => {
  it('parses with CarrierSchema', () => {
    expect(() => CarrierSchema.parse(transformProvider(documentedProvider()))).not.toThrow()
  })

  it('maps provider_id to id and code', () => {
    const c = CarrierSchema.parse(transformProvider(documentedProvider()))
    expect(c.id).toBe('doordash')
    expect(c.code).toBe('doordash')
  })

  it('maps provider_name to name', () => {
    expect(transformProvider(documentedProvider()).name).toBe('Doordash')
  })

  it('keeps the raw provider in metadata', () => {
    const raw = { ...documentedProvider(), delivery_capabilities: {} }
    expect(transformProvider(raw).metadata).toEqual(raw)
  })
})
