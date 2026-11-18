import { describe, it, expect } from 'vitest'
import {
  transformContact,
  untransformContact,
  type RawPipelineCrmPerson,
} from '../../../../../../../src/verticals/crm/adapters/pipeline-crm/transform/contact'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'

function makeRaw(overrides: Partial<RawPipelineCrmPerson> = {}): RawPipelineCrmPerson {
  return {
    id: 'p-42',
    first_name: 'Jane',
    last_name: 'Doe',
    email: 'jane.doe@acme.example',
    phone: '+14155550100',
    mobile: '+14155550101',
    title: 'Head of Finance',
    company_id: 'co-7',
    owner_id: 'usr-1',
    created_at: '2026-01-15T09:30:00.000Z',
    updated_at: '2026-01-20T12:00:00.000Z',
    ...overrides,
  }
}

describe('pipeline-crm transformContact', () => {
  it('maps id', () => {
    expect(transformContact(makeRaw()).id).toBe('p-42')
  })

  it('maps first_name', () => {
    expect(transformContact(makeRaw()).first_name).toBe('Jane')
  })

  it('maps last_name', () => {
    expect(transformContact(makeRaw()).last_name).toBe('Doe')
  })

  it('derives name by joining first and last', () => {
    expect(transformContact(makeRaw()).name).toBe('Jane Doe')
  })

  it('maps email', () => {
    expect(transformContact(makeRaw()).email).toBe('jane.doe@acme.example')
  })

  it('maps phone', () => {
    expect(transformContact(makeRaw()).phone).toBe('+14155550100')
  })

  it('maps mobile', () => {
    expect(transformContact(makeRaw()).mobile).toBe('+14155550101')
  })

  it('maps title', () => {
    expect(transformContact(makeRaw()).title).toBe('Head of Finance')
  })

  it('maps company_id', () => {
    expect(transformContact(makeRaw()).company_id).toBe('co-7')
  })

  it('maps owner_id', () => {
    expect(transformContact(makeRaw()).owner_id).toBe('usr-1')
  })

  it('maps created_at as ISO datetime', () => {
    expect(transformContact(makeRaw()).created_at).toBe('2026-01-15T09:30:00.000Z')
  })

  it('passes ContactSchema validation', () => {
    expect(() => ContactSchema.parse(transformContact(makeRaw()))).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformContact(raw).metadata).toBe(raw)
  })

  it('untransformContact round-trips first_name', () => {
    expect(untransformContact({ first_name: 'John' }).first_name).toBe('John')
  })

  it('untransformContact round-trips email', () => {
    expect(untransformContact({ email: 'j@acme.example' }).email).toBe('j@acme.example')
  })
})
