import { describe, it, expect } from 'vitest'
import {
  transformContact,
  type RawOctadeskContact,
} from '../../../../../../../src/verticals/customer-support/adapters/octadesk/transform/contact'
import { ContactSchema } from '../../../../../../../src/verticals/customer-support/schema/contact'

describe('octadesk transformContact', () => {
  const raw: RawOctadeskContact = {
    id: 'person-uuid-001',
    name: 'Maria Silva',
    email: 'maria@example.com',
    phone: '+5511999990000',
    organization: { id: 'org-uuid-1', name: 'Acme Brasil' },
    createdAt: '2024-01-10T08:00:00.000Z',
  }

  it('maps id and externalId from raw.id', () => {
    const result = transformContact(raw)
    expect(result.id).toBe('person-uuid-001')
    expect(result.externalId).toBe('person-uuid-001')
  })

  it('maps name field', () => {
    const result = transformContact(raw)
    expect(result.name).toBe('Maria Silva')
  })

  it('maps email field', () => {
    const result = transformContact(raw)
    expect(result.email).toBe('maria@example.com')
  })

  it('maps phone field', () => {
    const result = transformContact(raw)
    expect(result.phone).toBe('+5511999990000')
  })

  it('maps organization.id to organizationId', () => {
    const result = transformContact(raw)
    expect(result.organizationId).toBe('org-uuid-1')
  })

  it('places organizationName in metadata', () => {
    const result = transformContact(raw)
    expect(result.metadata['organizationName']).toBe('Acme Brasil')
  })

  it('sets platform to octadesk', () => {
    const result = transformContact(raw)
    expect(result.platform).toBe('octadesk')
  })

  it('produces a ContactSchema-valid result', () => {
    const result = transformContact(raw)
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })

  it('organizationId is undefined when organization is absent', () => {
    const noOrg: RawOctadeskContact = { id: 'p2', name: 'Bob', email: 'bob@example.com' }
    const result = transformContact(noOrg)
    expect(result.organizationId).toBeUndefined()
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
