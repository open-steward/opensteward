import { describe, it, expect } from 'vitest'
import {
  transformContact,
  untransformContact,
  type RawSapIndividual,
} from '../../../../../../../src/verticals/crm/adapters/sap-sales-cloud/transform/contact'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'

function makeRaw(overrides: Partial<RawSapIndividual> = {}): RawSapIndividual {
  return { id: 'sap-uuid-001', ...overrides }
}

describe('sap-sales-cloud transformContact', () => {
  it('maps id to string', () => {
    expect(transformContact(makeRaw({ id: 'sap-123' })).id).toBe('sap-123')
  })

  it('maps firstName and lastName', () => {
    const result = transformContact(makeRaw({ firstName: 'Jane', lastName: 'Doe' }))
    expect(result.first_name).toBe('Jane')
    expect(result.last_name).toBe('Doe')
  })

  it('derives name from firstName + lastName when fullName absent', () => {
    const result = transformContact(makeRaw({ firstName: 'Jane', lastName: 'Doe' }))
    expect(result.name).toBe('Jane Doe')
  })

  it('prefers explicit fullName over derived join', () => {
    const result = transformContact(
      makeRaw({ firstName: 'Jane', lastName: 'Doe', fullName: 'Dr. Jane Doe' }),
    )
    expect(result.name).toBe('Dr. Jane Doe')
  })

  it('maps emailAddress to email', () => {
    const result = transformContact(makeRaw({ emailAddress: 'jane@example.com' }))
    expect(result.email).toBe('jane@example.com')
  })

  it('maps phone and mobilePhone', () => {
    const result = transformContact(makeRaw({ phone: '+14155550001', mobilePhone: '+14155550002' }))
    expect(result.phone).toBe('+14155550001')
    expect(result.mobile).toBe('+14155550002')
  })

  it('maps jobTitle to title', () => {
    expect(transformContact(makeRaw({ jobTitle: 'CTO' })).title).toBe('CTO')
  })

  it('maps accountId to company_id', () => {
    expect(transformContact(makeRaw({ accountId: 'acc-88' })).company_id).toBe('acc-88')
  })

  it('maps ownerId to owner_id', () => {
    expect(transformContact(makeRaw({ ownerId: 'usr-44' })).owner_id).toBe('usr-44')
  })

  it('coerces createdAt through toIsoDatetime', () => {
    const result = transformContact(makeRaw({ createdAt: '2024-03-01T12:00:00.000Z' }))
    expect(result.created_at).toBe('2024-03-01T12:00:00.000Z')
  })

  it('handles naïve datetime (no offset) via toIsoDatetime', () => {
    // '2024-03-01T12:00:00' — no offset, parsed as local; toIsoDatetime normalises to ISO
    const result = transformContact(makeRaw({ createdAt: '2024-03-01T12:00:00' }))
    // should be a valid ISO string (offset added by Date.toISOString())
    expect(result.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  })

  it('preserves raw metadata', () => {
    const raw = makeRaw({ firstName: 'John' })
    expect(transformContact(raw).metadata).toBe(raw)
  })

  it('produces schema-valid output', () => {
    const raw: RawSapIndividual = {
      id: 'sap-contact-1',
      firstName: 'Jane',
      lastName: 'Doe',
      emailAddress: 'jane@example.com',
      phone: '+15550001111',
      mobilePhone: '+15550002222',
      jobTitle: 'Engineer',
      accountId: 'acc-1',
      ownerId: 'usr-1',
      createdAt: '2024-01-01T00:00:00.000Z',
      lastModifiedAt: '2024-06-01T00:00:00.000Z',
    }
    expect(() => ContactSchema.parse(transformContact(raw))).not.toThrow()
  })
})

describe('sap-sales-cloud untransformContact', () => {
  it('maps first_name to firstName', () => {
    expect(untransformContact({ first_name: 'Alice' })).toMatchObject({ firstName: 'Alice' })
  })

  it('maps email to emailAddress', () => {
    expect(untransformContact({ email: 'a@example.com' })).toMatchObject({
      emailAddress: 'a@example.com',
    })
  })

  it('maps mobile to mobilePhone', () => {
    expect(untransformContact({ mobile: '+1555' })).toMatchObject({ mobilePhone: '+1555' })
  })

  it('maps company_id to accountId', () => {
    expect(untransformContact({ company_id: 'acc-5' })).toMatchObject({ accountId: 'acc-5' })
  })

  it('omits undefined fields', () => {
    const result = untransformContact({})
    expect(Object.keys(result)).toHaveLength(0)
  })
})
