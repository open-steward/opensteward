import { describe, it, expect } from 'vitest'
import {
  transformOrganization,
  type CashCtrlSettings,
} from '../../../../../../../src/verticals/accounting/adapters/cashctrl/transform/organization'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'

function makeSettings(overrides: Partial<CashCtrlSettings> = {}): CashCtrlSettings {
  return {
    name: 'Acme AG',
    legalName: 'Acme AG',
    taxNumber: 'CHE-123.456.789',
    currencyCode: 'CHF',
    website: 'https://www.acme.ch',
    address: 'Bahnhofstrasse 1',
    zip: '8001',
    city: 'Zurich',
    country: 'CH',
    ...overrides,
  }
}

describe('transformOrganization', () => {
  it('maps name', () => {
    expect(transformOrganization(makeSettings({ name: 'Acme AG' })).name).toBe('Acme AG')
  })

  it('maps legalName', () => {
    expect(transformOrganization(makeSettings({ legalName: 'Acme AG GmbH' })).legalName).toBe(
      'Acme AG GmbH',
    )
  })

  it('falls back to name when legalName is null', () => {
    expect(
      transformOrganization(makeSettings({ legalName: null, name: 'Fallback Corp' })).legalName,
    ).toBe('Fallback Corp')
  })

  it('maps taxNumber', () => {
    expect(transformOrganization(makeSettings({ taxNumber: 'CHE-111.222.333' })).taxNumber).toBe(
      'CHE-111.222.333',
    )
  })

  it('maps currencyCode to currency', () => {
    expect(transformOrganization(makeSettings({ currencyCode: 'EUR' })).currency).toBe('EUR')
  })

  it('maps website', () => {
    expect(transformOrganization(makeSettings({ website: 'https://example.com' })).website).toBe(
      'https://example.com',
    )
  })

  it('maps address fields to address object', () => {
    const result = transformOrganization(makeSettings())
    expect(result.address).toBeDefined()
    expect(result.address!.address1).toBe('Bahnhofstrasse 1')
    expect(result.address!.city).toBe('Zurich')
    expect(result.address!.postalCode).toBe('8001')
    expect(result.address!.country).toBe('CH')
  })

  it('leaves address undefined when no address fields present', () => {
    const result = transformOrganization(
      makeSettings({ address: null, zip: null, city: null, country: null }),
    )
    expect(result.address).toBeUndefined()
  })

  it('note: no id field — organization has no id', () => {
    // CashCtrlSettings is a settings object with no id
    const result = transformOrganization(makeSettings())
    expect((result as Record<string, unknown>).id).toBeUndefined()
  })

  it('passes raw object as metadata', () => {
    const raw = makeSettings()
    expect(transformOrganization(raw).metadata).toBe(raw)
  })

  it('output passes schema validation', () => {
    expect(() => OrganizationSchema.parse(transformOrganization(makeSettings()))).not.toThrow()
  })
})
