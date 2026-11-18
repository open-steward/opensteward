import { describe, it, expect } from 'vitest'
import {
  transformAddress,
  type Locate2uContact,
} from '../../../../../../../src/verticals/logistics/adapters/locate2u/transform/address'
import { AddressSchema } from '../../../../../../../src/verticals/logistics/schema/shared'

const contact: Locate2uContact = {
  name: 'Jane Doe',
  phone: '+15125550100',
  email: 'jane@example.com',
}

describe('locate2u transformAddress', () => {
  it('maps address string to street1', () => {
    const result = transformAddress('123 Main St', contact)
    expect(result?.street1).toBe('123 Main St')
  })

  it('maps contact name', () => {
    expect(transformAddress('123 Main St', contact)?.name).toBe('Jane Doe')
  })

  it('maps contact phone', () => {
    expect(transformAddress('123 Main St', contact)?.phone).toBe('+15125550100')
  })

  it('maps contact email', () => {
    expect(transformAddress('123 Main St', contact)?.email).toBe('jane@example.com')
  })

  it('returns address when only address string provided (no contact)', () => {
    const result = transformAddress('456 Oak Ave')
    expect(result?.street1).toBe('456 Oak Ave')
    expect(result?.name).toBeUndefined()
  })

  it('returns address when only contact provided (no address string)', () => {
    const result = transformAddress(null, { name: 'Bob' })
    expect(result?.name).toBe('Bob')
    expect(result?.street1).toBeUndefined()
  })

  it('returns undefined when both address and contact are absent', () => {
    expect(transformAddress(null, null)).toBeUndefined()
  })

  it('returns undefined when address is empty string and contact is null', () => {
    expect(transformAddress('', null)).toBeUndefined()
  })

  it('returns undefined when address is whitespace-only and contact is null', () => {
    expect(transformAddress('   ', null)).toBeUndefined()
  })

  it('validates against AddressSchema', () => {
    const result = transformAddress('123 Main St', contact)
    expect(() => AddressSchema.parse(result)).not.toThrow()
  })
})
