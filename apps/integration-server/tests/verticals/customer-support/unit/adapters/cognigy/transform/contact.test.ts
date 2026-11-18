import { describe, it, expect } from 'vitest'
import {
  transformContact,
  type RawCognigyContact,
} from '../../../../../../../src/verticals/customer-support/adapters/cognigy/transform/contact'
import { ContactSchema } from '../../../../../../../src/verticals/customer-support/schema/contact'

describe('cognigy transformContact', () => {
  const raw: RawCognigyContact = {
    id: 55,
    name: 'Carlos Rivera',
    email: 'carlos@example.com',
    phone_number: '+15105550199',
    identifier: 'ext_carlos',
    blocked: false,
    availability_status: 'online',
  }

  it('maps id to string', () => {
    const out = transformContact(raw)
    expect(out.id).toBe('55')
  })

  it('maps externalId from identifier when present', () => {
    const out = transformContact(raw)
    expect(out.externalId).toBe('ext_carlos')
  })

  it('falls back to string id when identifier is absent', () => {
    const out = transformContact({ id: 55, name: 'No Ident' })
    expect(out.externalId).toBe('55')
  })

  it('maps email', () => {
    const out = transformContact(raw)
    expect(out.email).toBe('carlos@example.com')
  })

  it('maps name', () => {
    const out = transformContact(raw)
    expect(out.name).toBe('Carlos Rivera')
  })

  it('maps phone from phone_number', () => {
    const out = transformContact(raw)
    expect(out.phone).toBe('+15105550199')
  })

  it('sets platform to cognigy', () => {
    const out = transformContact(raw)
    expect(out.platform).toBe('cognigy')
  })

  it('stores availabilityStatus in metadata', () => {
    const out = transformContact(raw)
    expect(out.metadata.availabilityStatus).toBe('online')
  })

  it('passes ContactSchema.parse', () => {
    const out = transformContact(raw)
    expect(() => ContactSchema.parse(out)).not.toThrow()
  })

  it('handles null email gracefully', () => {
    const out = transformContact({ id: 1, name: 'No Email', email: null })
    expect(out.email).toBeUndefined()
    expect(() => ContactSchema.parse(out)).not.toThrow()
  })
})
