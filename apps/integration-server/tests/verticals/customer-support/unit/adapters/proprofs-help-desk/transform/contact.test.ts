import { describe, it, expect } from 'vitest'
import {
  transformContact,
  type RawProprofsContact,
} from '../../../../../../../src/verticals/customer-support/adapters/proprofs-help-desk/transform/contact'
import { ContactSchema } from '../../../../../../../src/verticals/customer-support/schema/contact'

describe('proprofs-help-desk transformContact', () => {
  it('maps a fully-populated contact with numeric id', () => {
    const raw: RawProprofsContact = {
      id: 42,
      email: 'jane@example.com',
      name: 'Jane Doe',
      phone: '+14155550123',
      company_name: 'Acme Corp',
      portal: 'main',
    }

    const result = transformContact(raw)

    // id maps from raw.id
    expect(result.id).toBe('42')
    expect(result.externalId).toBe('42')
    // email maps directly
    expect(result.email).toBe('jane@example.com')
    // name maps directly
    expect(result.name).toBe('Jane Doe')
    // phone maps directly
    expect(result.phone).toBe('+14155550123')
    // organizationId maps from company_name
    expect(result.organizationId).toBe('Acme Corp')
    // platform
    expect(result.platform).toBe('proprofs-help-desk')

    expect(() => ContactSchema.parse(result)).not.toThrow()
  })

  it('uses email as id when no numeric id is present', () => {
    const raw: RawProprofsContact = {
      email: 'bob@example.com',
      name: 'Bob Builder',
    }

    const result = transformContact(raw)

    // id falls back to email when raw.id absent
    expect(result.id).toBe('bob@example.com')
    expect(result.externalId).toBe('bob@example.com')
    expect(result.name).toBe('Bob Builder')
    expect(result.phone).toBeUndefined()
    expect(result.organizationId).toBeUndefined()

    expect(() => ContactSchema.parse(result)).not.toThrow()
  })

  it('handles missing optional fields gracefully', () => {
    const raw: RawProprofsContact = {
      id: '99',
      email: 'minimal@example.com',
      name: 'Minimal User',
    }

    const result = transformContact(raw)

    expect(result.id).toBe('99')
    expect(result.phone).toBeUndefined()
    expect(result.organizationId).toBeUndefined()

    expect(() => ContactSchema.parse(result)).not.toThrow()
  })

  it('produces empty id string when both id and email are absent', () => {
    const raw: RawProprofsContact = {
      name: 'Unknown',
    }

    const result = transformContact(raw)

    // id = '' when neither id nor email is present
    expect(result.id).toBe('')
    expect(result.email).toBeUndefined()
    // ContactSchema allows empty string id
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
