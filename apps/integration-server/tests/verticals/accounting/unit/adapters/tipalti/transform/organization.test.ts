import { describe, it, expect } from 'vitest'
import {
  transformOrganization,
  type TipaltiEntity,
} from '../../../../../../../src/verticals/accounting/adapters/tipalti/transform/organization'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'

function makeRaw(overrides: Partial<TipaltiEntity> = {}): TipaltiEntity {
  return {
    id: 'entity-001',
    name: 'GlobalPay Corp',
    legalName: 'GlobalPay Corporation',
    taxId: 'US-999888777',
    currency: 'USD',
    timezone: 'America/Chicago',
    website: 'https://globalpay.example',
    address: {
      line1: '100 Financial Dr',
      line2: 'Suite 200',
      city: 'Dallas',
      state: 'TX',
      zip: '75201',
      country: 'US',
    },
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-06-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('tipalti transformOrganization', () => {
  it('maps id', () => {
    expect(transformOrganization(makeRaw()).id).toBe('entity-001')
  })

  it('maps name', () => {
    expect(transformOrganization(makeRaw()).name).toBe('GlobalPay Corp')
  })

  it('maps legalName', () => {
    expect(transformOrganization(makeRaw()).legalName).toBe('GlobalPay Corporation')
  })

  it('maps taxId to taxNumber', () => {
    expect(transformOrganization(makeRaw()).taxNumber).toBe('US-999888777')
  })

  it('maps currency', () => {
    expect(transformOrganization(makeRaw()).currency).toBe('USD')
  })

  it('maps timezone', () => {
    expect(transformOrganization(makeRaw()).timezone).toBe('America/Chicago')
  })

  it('maps website', () => {
    expect(transformOrganization(makeRaw()).website).toBe('https://globalpay.example')
  })

  it('maps address line1 to address1', () => {
    expect(transformOrganization(makeRaw()).address?.address1).toBe('100 Financial Dr')
  })

  it('maps address state to region', () => {
    expect(transformOrganization(makeRaw()).address?.region).toBe('TX')
  })

  it('maps address zip to postalCode', () => {
    expect(transformOrganization(makeRaw()).address?.postalCode).toBe('75201')
  })

  it('maps address country', () => {
    expect(transformOrganization(makeRaw()).address?.country).toBe('US')
  })

  it('omits address when absent', () => {
    expect(transformOrganization(makeRaw({ address: undefined })).address).toBeUndefined()
  })

  it('maps createdAt to Date', () => {
    expect(transformOrganization(makeRaw()).createdAt).toEqual(new Date('2024-01-01T00:00:00.000Z'))
  })

  it('maps updatedAt to Date', () => {
    expect(transformOrganization(makeRaw()).updatedAt).toEqual(new Date('2024-06-01T00:00:00.000Z'))
  })

  it('passes OrganizationSchema validation', () => {
    expect(() => OrganizationSchema.parse(transformOrganization(makeRaw()))).not.toThrow()
  })

  it('preserves raw as metadata', () => {
    const raw = makeRaw()
    expect(transformOrganization(raw).metadata).toBe(raw)
  })

  it('handles empty input gracefully', () => {
    expect(() => transformOrganization({})).not.toThrow()
  })
})
