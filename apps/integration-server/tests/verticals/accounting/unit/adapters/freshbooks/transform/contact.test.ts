import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import {
  transformClient,
  type FreshBooksClient,
} from '../../../../../../../src/verticals/accounting/adapters/freshbooks/transform/contact'

function makeClient(overrides: Partial<FreshBooksClient> = {}): FreshBooksClient {
  return {
    id: 55,
    fname: 'Jane',
    lname: 'Doe',
    email: 'jane@example.com',
    organization: 'Acme Corp',
    work_phone: '+1-555-0100',
    mobile_phone: '+1-555-0101',
    currency_code: 'USD',
    p_street: '123 Main St',
    p_street2: 'Suite 4',
    p_city: 'Springfield',
    p_code: '12345',
    p_province: 'IL',
    p_country: 'US',
    s_street: '456 Oak Ave',
    s_street2: '',
    s_city: 'Shelbyville',
    s_code: '67890',
    s_country: 'US',
    vis_state: 0,
    ...overrides,
  }
}

describe('transformClient', () => {
  it('maps id correctly (number to string)', () => {
    expect(transformClient(makeClient()).id).toBe('55')
  })

  it('maps organization to companyName', () => {
    expect(transformClient(makeClient()).companyName).toBe('Acme Corp')
  })

  it('uses organization as name when present', () => {
    expect(transformClient(makeClient()).name).toBe('Acme Corp')
  })

  it('falls back to fname + lname for name when no organization', () => {
    const result = transformClient(makeClient({ organization: '' }))
    expect(result.name).toBe('Jane Doe')
  })

  it('maps fname to firstName', () => {
    expect(transformClient(makeClient()).firstName).toBe('Jane')
  })

  it('maps lname to lastName', () => {
    expect(transformClient(makeClient()).lastName).toBe('Doe')
  })

  it('maps currency_code to currency', () => {
    expect(transformClient(makeClient()).currency).toBe('USD')
  })

  it('maps email to emails array with type WORK', () => {
    const result = transformClient(makeClient())
    expect(result.emails).toHaveLength(1)
    expect(result.emails![0].email).toBe('jane@example.com')
    expect(result.emails![0].type).toBe('WORK')
  })

  it('maps work_phone to telephones with type WORK', () => {
    const result = transformClient(makeClient())
    const workPhone = result.telephones?.find((t) => t.type === 'WORK')
    expect(workPhone?.telephone).toBe('+1-555-0100')
  })

  it('maps mobile_phone to telephones with type MOBILE', () => {
    const result = transformClient(makeClient())
    const mobilePhone = result.telephones?.find((t) => t.type === 'MOBILE')
    expect(mobilePhone?.telephone).toBe('+1-555-0101')
  })

  it('maps billing address fields correctly', () => {
    const result = transformClient(makeClient())
    expect(result.billingAddress?.address1).toBe('123 Main St')
    expect(result.billingAddress?.city).toBe('Springfield')
    expect(result.billingAddress?.postalCode).toBe('12345')
    expect(result.billingAddress?.country).toBe('US')
  })

  it('maps shipping address fields correctly', () => {
    const result = transformClient(makeClient())
    expect(result.shippingAddress?.address1).toBe('456 Oak Ave')
    expect(result.shippingAddress?.city).toBe('Shelbyville')
    expect(result.shippingAddress?.postalCode).toBe('67890')
    expect(result.shippingAddress?.country).toBe('US')
  })

  it('maps vis_state 0 to isActive true', () => {
    expect(transformClient(makeClient({ vis_state: 0 })).isActive).toBe(true)
  })

  it('maps vis_state 1 to isActive false', () => {
    expect(transformClient(makeClient({ vis_state: 1 })).isActive).toBe(false)
  })

  it('sets isCustomer to true', () => {
    expect(transformClient(makeClient()).isCustomer).toBe(true)
  })

  it('sets isSupplier to false', () => {
    expect(transformClient(makeClient()).isSupplier).toBe(false)
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeClient()
    expect(transformClient(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformClient(makeClient())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
