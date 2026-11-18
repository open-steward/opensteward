import { describe, it, expect } from 'vitest'
import {
  transformContact,
  untransformContact,
  type RawCarerixEmployee,
} from '../../../../../../../src/verticals/crm/adapters/carerix/transform/contact'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'

function makeRaw(overrides: Partial<RawCarerixEmployee> = {}): RawCarerixEmployee {
  return { employeeID: 1, ...overrides }
}

describe('carerix transformContact', () => {
  it('maps employeeID to string id', () => {
    expect(transformContact(makeRaw({ employeeID: 42 })).id).toBe('42')
  })

  it('falls back to id when employeeID is absent', () => {
    expect(transformContact({ id: 77 }).id).toBe('77')
  })

  it('maps firstName and lastName', () => {
    const result = transformContact(makeRaw({ firstName: 'Jane', lastName: 'Doe' }))
    expect(result.first_name).toBe('Jane')
    expect(result.last_name).toBe('Doe')
  })

  it('derives full name from first+last', () => {
    const result = transformContact(makeRaw({ firstName: 'Jane', lastName: 'Doe' }))
    expect(result.name).toBe('Jane Doe')
  })

  it('maps emailAddress to email', () => {
    const result = transformContact(makeRaw({ emailAddress: 'jane@acme.com' }))
    expect(result.email).toBe('jane@acme.com')
  })

  it('maps phoneNumber to phone', () => {
    const result = transformContact(makeRaw({ phoneNumber: '+14155550123' }))
    expect(result.phone).toBe('+14155550123')
  })

  it('maps mobilePhoneNumber to mobile', () => {
    const result = transformContact(makeRaw({ mobilePhoneNumber: '+14155550199' }))
    expect(result.mobile).toBe('+14155550199')
  })

  it('maps toUserFunctionDescription to title', () => {
    const result = transformContact(makeRaw({ toUserFunctionDescription: 'VP Sales' }))
    expect(result.title).toBe('VP Sales')
  })

  it('extracts company_id from toCompany object', () => {
    const result = transformContact(makeRaw({ toCompany: { id: 20 } }))
    expect(result.company_id).toBe('20')
  })

  it('extracts company_id from toCompany string', () => {
    const result = transformContact(makeRaw({ toCompany: 'co_99' }))
    expect(result.company_id).toBe('co_99')
  })

  it('maps dateCreated/dateModified to created_at/updated_at', () => {
    const result = transformContact(
      makeRaw({
        dateCreated: '2026-01-01T00:00:00.000Z',
        dateModified: '2026-02-01T00:00:00.000Z',
      }),
    )
    expect(result.created_at).toBe('2026-01-01T00:00:00.000Z')
    expect(result.updated_at).toBe('2026-02-01T00:00:00.000Z')
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformContact(raw).metadata).toBe(raw)
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformContact(makeRaw())).not.toThrow()
  })

  it('produces output that passes ContactSchema.parse', () => {
    const raw = makeRaw({
      firstName: 'Jane',
      lastName: 'Doe',
      emailAddress: 'jane@acme.com',
      phoneNumber: '+14155550123',
      mobilePhoneNumber: '+14155550199',
      toUserFunctionDescription: 'VP Sales',
      toCompany: { id: 5 },
      dateCreated: '2026-01-01T00:00:00.000Z',
      dateModified: '2026-02-01T00:00:00.000Z',
    })
    expect(() => ContactSchema.parse(transformContact(raw))).not.toThrow()
  })
})

describe('carerix untransformContact', () => {
  it('maps first_name to firstName', () => {
    const result = untransformContact({ first_name: 'Jane' })
    expect(result.firstName).toBe('Jane')
  })

  it('maps last_name to lastName', () => {
    const result = untransformContact({ last_name: 'Doe' })
    expect(result.lastName).toBe('Doe')
  })

  it('maps email to emailAddress', () => {
    const result = untransformContact({ email: 'jane@acme.com' })
    expect(result.emailAddress).toBe('jane@acme.com')
  })

  it('maps mobile to mobilePhoneNumber', () => {
    const result = untransformContact({ mobile: '+14155550199' })
    expect(result.mobilePhoneNumber).toBe('+14155550199')
  })

  it('maps company_id to toCompany', () => {
    const result = untransformContact({ company_id: 'co_7' })
    expect(result.toCompany).toBe('co_7')
  })

  it('omits undefined fields', () => {
    const result = untransformContact({})
    expect(Object.keys(result)).toHaveLength(0)
  })
})
