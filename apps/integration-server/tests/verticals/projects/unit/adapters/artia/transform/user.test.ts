/**
 * Artia organisation user → canonical User.
 *
 * Fixture fields are the documented return parameters of
 * `listingOrganizationUsers` / `showOrganizationUser`
 * (https://documenter.getpostman.com/view/10208526/TVCZaWK4, "Usuarios /
 * Organização / Listar Usuários da Organização"): id ("ID do vínculo do usuário
 * na organização"), user_id ("ID do usuário"), name, email, role, suspended.
 * The collection publishes no example response, so the values are illustrative.
 */
import { describe, it, expect } from 'vitest'
import {
  transformUser,
  type RawArtiaOrganizationUser,
} from '../../../../../../../src/verticals/projects/adapters/artia/transform/user'
import { UserSchema } from '../../../../../../../src/verticals/projects/schema/user'

const raw: RawArtiaOrganizationUser = {
  id: '501',
  userId: 42,
  name: 'Frank Torres',
  email: 'frank@acme.example',
  role: 'admin',
  suspended: false,
}

describe('artia transformUser', () => {
  it('parses with UserSchema', () => {
    expect(() => UserSchema.parse(transformUser(raw, '7'))).not.toThrow()
  })

  it('uses userId (the id showOrganizationUser looks up), not the membership id', () => {
    const u = UserSchema.parse(transformUser(raw, '7'))
    expect(u.id).toBe('42')
    expect(u.externalId).toBe('42')
    expect(u.metadata['organizationUserId']).toBe('501')
  })

  it('maps name, email, role and suspended', () => {
    const u = UserSchema.parse(transformUser(raw, '7'))
    expect(u.name).toBe('Frank Torres')
    expect(u.email).toBe('frank@acme.example')
    expect(u.metadata['role']).toBe('admin')
    expect(u.metadata['suspended']).toBe('false')
  })

  it('workspaceIds is the connection organisation', () => {
    expect(transformUser(raw, '7').workspaceIds).toEqual(['7'])
  })

  it('email is undefined when absent', () => {
    const u = UserSchema.parse(transformUser({ userId: 1, name: 'No Email' }, '7'))
    expect(u.email).toBeUndefined()
  })

  it('throws when userId is missing rather than inventing an id', () => {
    expect(() => transformUser({ id: '501', name: 'x' }, '7')).toThrow(/userId/)
  })

  it('platform is artia', () => {
    expect(transformUser(raw, '7').platform).toBe('artia')
  })
})
