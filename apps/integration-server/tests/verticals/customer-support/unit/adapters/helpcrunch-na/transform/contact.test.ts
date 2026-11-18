import { describe, it, expect } from 'vitest'
import {
  transformContact,
  type RawInvGateUser,
} from '../../../../../../../src/verticals/customer-support/adapters/helpcrunch-na/transform/contact'
import { ContactSchema } from '../../../../../../../src/verticals/customer-support/schema/contact'

describe('helpcrunch-na transformContact', () => {
  const raw: RawInvGateUser = {
    id: 77,
    name: 'Bob Johnson',
    email: 'bob.johnson@example.com',
    username: 'bjohnson',
    phone: '+14155550100',
    company_id: 5,
    role: 'user',
  }

  it('maps id to string id and externalId', () => {
    const result = transformContact(raw)
    expect(result.id).toBe('77')
    expect(result.externalId).toBe('77')
  })

  it('maps email field', () => {
    const result = transformContact(raw)
    expect(result.email).toBe('bob.johnson@example.com')
  })

  it('maps name field', () => {
    const result = transformContact(raw)
    expect(result.name).toBe('Bob Johnson')
  })

  it('maps phone field', () => {
    const result = transformContact(raw)
    expect(result.phone).toBe('+14155550100')
  })

  it('maps company_id to organizationId', () => {
    const result = transformContact(raw)
    expect(result.organizationId).toBe('5')
  })

  it('sets platform to helpcrunch-na', () => {
    const result = transformContact(raw)
    expect(result.platform).toBe('helpcrunch-na')
  })

  it('produces a ContactSchema-valid result', () => {
    const result = transformContact(raw)
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })

  it('falls back to username when name is absent', () => {
    const noName: RawInvGateUser = { id: 88, username: 'fallback_user' }
    const result = transformContact(noName)
    expect(result.name).toBe('fallback_user')
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })

  it('omits organizationId when company_id is null', () => {
    const noCompany: RawInvGateUser = { ...raw, company_id: null }
    const result = transformContact(noCompany)
    expect(result.organizationId).toBeUndefined()
  })

  it('omits phone when absent', () => {
    const noPhone: RawInvGateUser = { ...raw, phone: null }
    const result = transformContact(noPhone)
    expect(result.phone).toBeUndefined()
  })
})
