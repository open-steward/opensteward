/**
 * Console-user email: set at creation, changed or cleared later, shown in every
 * user view, validated, and never written to the audit log.
 *
 * Boots the real admin-api (access resolver included), so the tenant-scope
 * guard on an email change runs exactly as in production.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  buildAdminApiTestServer,
  createUserAndLogin,
  setupAdmin,
  type AdminApiTestServer,
} from '../journeys/helpers'

const EMAIL = 'olivia@northwind.example'

let server: AdminApiTestServer
let admin: string

beforeEach(async () => {
  server = await buildAdminApiTestServer()
  admin = await setupAdmin(server)
})

afterEach(async () => {
  await server?.cleanup()
})

const auth = (token: string) => ({ authorization: `Bearer ${token}` })

async function createUser(payload: Record<string, unknown>) {
  return server.fastify.inject({
    method: 'POST',
    url: '/api/users',
    headers: auth(admin),
    payload: { password: 'SecurePass123!', role: 'viewer', ...payload },
  })
}

async function patch(id: string, payload: Record<string, unknown>, token = admin) {
  return server.fastify.inject({
    method: 'PATCH',
    url: `/api/users/${id}`,
    headers: auth(token),
    payload,
  })
}

async function detail(id: string) {
  const res = await server.fastify.inject({
    method: 'GET',
    url: `/api/users/${id}`,
    headers: auth(admin),
  })
  expect(res.statusCode).toBe(200)
  return res.json().data
}

async function auditText(): Promise<string> {
  const rows = await server.adminStore.listAudit(500, 0)
  return rows.map((r) => `${r.action} ${r.detail ?? ''}`).join('\n')
}

describe('email on create', () => {
  it('stores a trimmed address, owned by the console, and lists it', async () => {
    const res = await createUser({ username: 'olivia', email: `  ${EMAIL} ` })
    expect(res.statusCode).toBe(201)
    const created = res.json().data
    expect(created.email).toBe(EMAIL)

    const one = await detail(created.id)
    expect(one.email).toBe(EMAIL)
    expect(one.emailSource).toBe('manual')

    const list = await server.fastify.inject({ method: 'GET', url: '/api/users', headers: auth(admin) })
    const row = list.json().data.find((u: { id: string }) => u.id === created.id)
    expect(row.email).toBe(EMAIL)
    expect(row.avatarUrl).toBeNull()
  })

  it('is optional', async () => {
    const res = await createUser({ username: 'plain' })
    expect(res.statusCode).toBe(201)
    const one = await detail(res.json().data.id)
    expect(one.email).toBeNull()
    expect(one.emailSource).toBeNull()
  })

  it.each([
    ['not an address', 'olivia'],
    ['a blank string', '   '],
    ['over 254 characters', `${'a'.repeat(250)}@x.example`],
    ['a number', 42],
  ])('refuses %s with 400 and creates nothing', async (_label, email) => {
    const res = await createUser({ username: 'bad', email })
    expect(res.statusCode).toBe(400)
    expect(await server.adminStore.getUserByUsername('bad')).toBeNull()
  })

  it('records that an email was set, never the address', async () => {
    await createUser({ username: 'olivia', email: EMAIL })
    const audit = await auditText()
    expect(audit).toContain('"emailSet":true')
    expect(audit).not.toContain(EMAIL)
  })
})

describe('email on update', () => {
  let id: string
  beforeEach(async () => {
    id = (await createUser({ username: 'olivia' })).json().data.id
  })

  it('sets, changes and clears the address, flagging each change in the audit log', async () => {
    const set = await patch(id, { email: EMAIL })
    expect(set.statusCode).toBe(200)
    expect(set.json().data.email).toBe(EMAIL)
    expect((await detail(id)).emailSource).toBe('manual')

    expect((await patch(id, { email: 'o2@northwind.example' })).statusCode).toBe(200)
    expect((await detail(id)).email).toBe('o2@northwind.example')

    const cleared = await patch(id, { email: null })
    expect(cleared.statusCode).toBe(200)
    const after = await detail(id)
    expect(after.email).toBeNull()
    expect(after.emailSource).toBeNull()

    const audit = await auditText()
    expect(audit.match(/"emailChanged":true/g)?.length).toBe(3)
    expect(audit).not.toContain(EMAIL)
    expect(audit).not.toContain('o2@northwind.example')
  })

  it('takes ownership of an IdP-sourced address when an admin sets it', async () => {
    await server.adminStore.setUserEmail(id, EMAIL, 'idp')
    expect((await detail(id)).emailSource).toBe('idp')
    // Same address, new owner: SSO must stop overwriting it from now on.
    expect((await patch(id, { email: EMAIL })).statusCode).toBe(200)
    expect((await detail(id)).emailSource).toBe('manual')
  })

  it('writes no audit flag when nothing changed', async () => {
    await patch(id, { email: EMAIL })
    const before = (await server.adminStore.listAudit(500, 0)).length
    await patch(id, { email: EMAIL })
    const rows = await server.adminStore.listAudit(500, 0)
    expect(rows.length).toBe(before + 1)
    expect(rows[0].detail ?? '').not.toContain('emailChanged')
  })

  it('refuses a malformed address with 400 and keeps the old one', async () => {
    await patch(id, { email: EMAIL })
    const res = await patch(id, { email: 'nope@' })
    expect(res.statusCode).toBe(400)
    expect((await detail(id)).email).toBe(EMAIL)
  })

  it('accepts an email-only update', async () => {
    const res = await patch(id, { email: EMAIL })
    expect(res.statusCode).toBe(200)
    expect((await patch(id, {})).statusCode).toBe(400)
  })

  it('is admin-only, like every other user edit', async () => {
    const operator = await createUserAndLogin(server, admin, 'op', 'operator')
    const res = await patch(id, { email: EMAIL }, operator)
    expect(res.statusCode).toBe(403)
    expect((await detail(id)).email).toBeNull()
  })

  it('refuses a thin admin-based role changing the email of an account that holds more', async () => {
    const thin = await createUserAndLogin(server, admin, 'thin', 'admin')
    const thinId = (await server.adminStore.getUserByUsername('thin'))!.id
    const role = await server.fastify.inject({
      method: 'POST',
      url: '/api/roles',
      headers: auth(admin),
      payload: { name: 'Thin admin', baseRole: 'admin', permissions: ['users:manage'] },
    })
    expect(role.statusCode, role.payload).toBe(201)
    const assign = await server.fastify.inject({
      method: 'PUT',
      url: `/api/users/${thinId}/role`,
      headers: auth(admin),
      payload: { roleId: role.json().data.id },
    })
    expect(assign.statusCode, assign.payload).toBe(200)

    // The first admin holds every permission; the thin role does not.
    const adminId = (await server.adminStore.getUserByUsername('admin'))!.id
    const res = await patch(adminId, { email: EMAIL }, thin)
    expect(res.statusCode).toBe(403)
    expect((await detail(adminId)).email).toBeNull()
    // Its own email is still its own.
    expect((await patch(thinId, { email: 'thin@northwind.example' }, thin)).statusCode).toBe(200)
  })
})

describe('GET /api/auth/me', () => {
  it('carries the caller’s email and avatar fields', async () => {
    const token = await createUserAndLogin(server, admin, 'olivia', 'viewer')
    const id = (await server.adminStore.getUserByUsername('olivia'))!.id
    await patch(id, { email: EMAIL })
    const me = await server.fastify.inject({ method: 'GET', url: '/api/auth/me', headers: auth(token) })
    expect(me.statusCode).toBe(200)
    expect(me.json().user.email).toBe(EMAIL)
    expect(me.json().user.avatarUrl).toBeNull()
    expect(me.json().user.avatarVersion).toBeNull()
  })
})
