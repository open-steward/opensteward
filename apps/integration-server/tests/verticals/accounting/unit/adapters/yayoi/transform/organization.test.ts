import { describe, it, expect } from 'vitest'
import {
  transformOrganization,
  type MisocaUser,
} from '../../../../../../../src/verticals/accounting/adapters/yayoi/transform/organization'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'

function makeRaw(overrides: Partial<MisocaUser> = {}): MisocaUser {
  return {
    id: 7,
    email: 'owner@acme.example',
    ...overrides,
  }
}

describe('transformOrganization (yayoi)', () => {
  it('maps id to string id', () => {
    expect(transformOrganization(makeRaw()).id).toBe('7')
  })

  it('maps email to name', () => {
    expect(transformOrganization(makeRaw()).name).toBe('owner@acme.example')
  })

  it('produces undefined id when id is absent', () => {
    expect(transformOrganization(makeRaw({ id: undefined })).id).toBeUndefined()
  })

  it('produces undefined name when email is absent', () => {
    expect(transformOrganization(makeRaw({ email: undefined })).name).toBeUndefined()
  })

  it('produces a schema-valid Organization', () => {
    expect(() => OrganizationSchema.parse(transformOrganization(makeRaw()))).not.toThrow()
  })
})
