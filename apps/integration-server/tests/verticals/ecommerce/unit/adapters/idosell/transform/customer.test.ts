/**
 * Shape verified against the raw OpenAPI fragment embedded in
 * https://idosell.readme.io/reference/clientsclientsget — name/phone/address
 * live under `clientBillingAddress`, not on the client record directly.
 */
import { describe, it, expect } from 'vitest'
import {
  transformClient,
  untransformClientForCreate,
  untransformClientForUpdate,
  type RawIdosellClient,
} from '../../../../../../../src/verticals/ecommerce/adapters/idosell/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/ecommerce/schema/customer'

function makeRaw(overrides: Partial<RawIdosellClient> = {}): RawIdosellClient {
  return {
    clientId: 88,
    clientLogin: 'jankowalski',
    clientEmail: 'jan@example.pl',
    clientRegistrationDate: '2024-03-01T00:00:00+01:00',
    clientsLastModificationDate: '2024-03-02T00:00:00+01:00',
    clientBillingAddress: {
      clientFirstName: 'Jan',
      clientLastName: 'Kowalski',
      clientStreet: 'ul. Marszalkowska 1',
      clientZipCode: '00-001',
      clientCity: 'Warsaw',
      clientCountryId: 'pl',
      clientPhone1: '+48-22-000-0001',
    },
    ...overrides,
  }
}

describe('transformClient (idosell)', () => {
  it('maps id and email', () => {
    const result = transformClient(makeRaw())
    expect(result.id).toBe('88')
    expect(result.email).toBe('jan@example.pl')
  })

  it('maps first/last name and phone from clientBillingAddress', () => {
    const result = transformClient(makeRaw())
    expect(result.firstName).toBe('Jan')
    expect(result.lastName).toBe('Kowalski')
    expect(result.phone).toBe('+48-22-000-0001')
  })

  it('maps and uppercases the country code', () => {
    expect(transformClient(makeRaw()).defaultAddress?.country).toBe('PL')
  })

  it('normalises registration/modification timestamps to strict ISO', () => {
    const result = transformClient(makeRaw())
    expect(result.createdAt).toBe('2024-02-29T23:00:00.000Z')
    expect(result.updatedAt).toBe('2024-03-01T23:00:00.000Z')
  })

  it('omits defaultAddress entirely when no billing address is present', () => {
    expect(transformClient(makeRaw({ clientBillingAddress: undefined })).defaultAddress).toBeUndefined()
  })

  it('produces a payload that satisfies CustomerSchema', () => {
    expect(() => CustomerSchema.parse(transformClient(makeRaw()))).not.toThrow()
  })

  it('untransformClientForCreate uses POST /clients/clients snake_case fields', () => {
    const body = untransformClientForCreate(transformClient(makeRaw()))
    expect(body).toMatchObject({ email: 'jan@example.pl', firstname: 'Jan', lastname: 'Kowalski' })
  })

  it('untransformClientForUpdate targets the record by clientLogin, not clientId', () => {
    const body = untransformClientForUpdate(transformClient(makeRaw()), 'jankowalski')
    expect(body).toMatchObject({ clientLogin: 'jankowalski', clientEmail: 'jan@example.pl' })
    expect(body).not.toHaveProperty('clientId')
  })
})
