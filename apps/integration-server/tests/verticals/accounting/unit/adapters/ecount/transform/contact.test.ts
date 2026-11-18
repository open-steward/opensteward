import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import {
  transformContact,
  type EcountContact,
} from '../../../../../../../src/verticals/accounting/adapters/ecount/transform/contact'

function makeRaw(overrides: Partial<EcountContact> = {}): EcountContact {
  return {
    CUST_CODE: 'CUST-001',
    CUST_NAME: 'Acme Korea Ltd',
    CUST_TYPE: '01',
    E_MAIL: 'info@acme.kr',
    TEL: '02-1234-5678',
    FAX: '02-1234-5679',
    ADDR: '123 Teheran-ro, Gangnam-gu',
    POSTAL_CODE: '06134',
    COUNTRY: 'KR',
    USE_YN: 'Y',
    BIZNO: '123-45-67890',
    CRNC_CODE: 'KRW',
    ...overrides,
  }
}

describe('transformContact (Ecount)', () => {
  it('maps core fields correctly', () => {
    const result = transformContact(makeRaw())
    expect(result.id).toBe('CUST-001')
    expect(result.name).toBe('Acme Korea Ltd')
    expect(result.taxNumber).toBe('123-45-67890')
    expect(result.currency).toBe('KRW')
  })

  it('maps CUST_TYPE 01 to customer only', () => {
    const result = transformContact(makeRaw({ CUST_TYPE: '01' }))
    expect(result.isCustomer).toBe(true)
    expect(result.isSupplier).toBe(false)
  })

  it('maps CUST_TYPE 02 to supplier only', () => {
    const result = transformContact(makeRaw({ CUST_TYPE: '02' }))
    expect(result.isCustomer).toBe(false)
    expect(result.isSupplier).toBe(true)
  })

  it('maps CUST_TYPE 03 to both customer and supplier', () => {
    const result = transformContact(makeRaw({ CUST_TYPE: '03' }))
    expect(result.isCustomer).toBe(true)
    expect(result.isSupplier).toBe(true)
  })

  it('maps USE_YN Y to isActive true', () => {
    const result = transformContact(makeRaw({ USE_YN: 'Y' }))
    expect(result.isActive).toBe(true)
  })

  it('maps USE_YN N to isActive false', () => {
    const result = transformContact(makeRaw({ USE_YN: 'N' }))
    expect(result.isActive).toBe(false)
  })

  it('maps email to work email', () => {
    const result = transformContact(makeRaw())
    expect(result.emails).toHaveLength(1)
    expect(result.emails![0].email).toBe('info@acme.kr')
    expect(result.emails![0].type).toBe('WORK')
  })

  it('maps TEL and FAX to telephones', () => {
    const result = transformContact(makeRaw())
    expect(result.telephones).toHaveLength(2)
    expect(result.telephones![0].type).toBe('WORK')
    expect(result.telephones![1].type).toBe('FAX')
  })

  it('maps billing address', () => {
    const result = transformContact(makeRaw())
    expect(result.billingAddress?.address1).toBe('123 Teheran-ro, Gangnam-gu')
    expect(result.billingAddress?.postalCode).toBe('06134')
    expect(result.billingAddress?.country).toBe('KR')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    const result = transformContact(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeRaw())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
