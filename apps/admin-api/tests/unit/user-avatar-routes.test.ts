/**
 * PUT / GET / DELETE /api/users/:id/avatar against the real admin-api boot.
 *
 * What is pinned: the type comes from the bytes (SVG and spoofed data URLs
 * refused), the 512 KB cap, who may change whose picture (self always;
 * someone else's needs users:manage and passes the escalation and scope
 * guards), and the headers the bytes are served with.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  buildAdminApiTestServer,
  createUserAndLogin,
  setupAdmin,
  type AdminApiTestServer,
} from '../journeys/helpers'
import { UserAvatarStore } from '../../src/core/db/user-avatar-store'
import { AVATAR_MAX_BYTES } from '../../src/core/users/avatar-image'
import { GIF, JPEG, PNG_1X1, SVG, WEBP, dataUrl, pngOfSize } from './avatar-fixtures'

let server: AdminApiTestServer
let admin: string
let adminId: string

beforeEach(async () => {
  server = await buildAdminApiTestServer()
  admin = await setupAdmin(server)
  adminId = (await server.adminStore.getUserByUsername('admin'))!.id
})

afterEach(async () => {
  await server?.cleanup()
})

const auth = (token: string) => ({ authorization: `Bearer ${token}` })

function put(id: string, data: string, token = admin) {
  return server.fastify.inject({
    method: 'PUT',
    url: `/api/users/${id}/avatar`,
    headers: auth(token),
    payload: { data },
  })
}

function del(id: string, token = admin) {
  return server.fastify.inject({ method: 'DELETE', url: `/api/users/${id}/avatar`, headers: auth(token) })
}

function get(id: string, token = admin, headers: Record<string, string> = {}) {
  return server.fastify.inject({
    method: 'GET',
    url: `/api/users/${id}/avatar`,
    headers: { ...auth(token), ...headers },
  })
}

async function userId(username: string): Promise<string> {
  return (await server.adminStore.getUserByUsername(username))!.id
}

describe('what an upload may contain', () => {
  it.each([
    ['PNG', 'image/png', PNG_1X1],
    ['JPEG', 'image/jpeg', JPEG],
    ['WebP', 'image/webp', WEBP],
  ])('accepts %s and stores the sniffed type', async (_label, mime, bytes) => {
    const res = await put(adminId, dataUrl(mime, bytes))
    expect(res.statusCode, res.payload).toBe(200)
    expect(res.json().data.contentType).toBe(mime)
    expect(res.json().data.source).toBe('upload')
    const back = await get(adminId)
    expect(Buffer.compare(back.rawPayload, bytes)).toBe(0)
  })

  it('accepts plain base64 as well as a data URL', async () => {
    expect((await put(adminId, PNG_1X1.toString('base64'))).statusCode).toBe(200)
  })

  it('refuses SVG with 415', async () => {
    const res = await put(adminId, dataUrl('image/svg+xml', SVG))
    expect(res.statusCode).toBe(415)
    expect(await UserAvatarStore.for(server.adminStore).head(adminId)).toBeNull()
  })

  it('refuses SVG and GIF bytes behind a spoofed image/png data URL', async () => {
    expect((await put(adminId, dataUrl('image/png', SVG))).statusCode).toBe(415)
    expect((await put(adminId, dataUrl('image/png', GIF))).statusCode).toBe(415)
    expect(await UserAvatarStore.for(server.adminStore).head(adminId)).toBeNull()
  })

  it('stores PNG bytes as PNG whatever the data URL claims', async () => {
    const res = await put(adminId, dataUrl('image/svg+xml', PNG_1X1))
    expect(res.statusCode).toBe(200)
    expect(res.json().data.contentType).toBe('image/png')
    expect((await get(adminId)).headers['content-type']).toBe('image/png')
  })

  it('accepts exactly 512 KB and refuses anything larger with 413', async () => {
    expect((await put(adminId, dataUrl('image/png', pngOfSize(AVATAR_MAX_BYTES)))).statusCode).toBe(200)
    const over = await put(adminId, dataUrl('image/png', pngOfSize(AVATAR_MAX_BYTES + 1)))
    expect(over.statusCode).toBe(413)
    // A body far past the cap is cut off by the route's body limit, also 413.
    const huge = await put(adminId, dataUrl('image/png', pngOfSize(900 * 1024)))
    expect(huge.statusCode).toBe(413)
  })

  it('refuses data that is not base64 with 400', async () => {
    expect((await put(adminId, 'data:image/png;base64,@@@@')).statusCode).toBe(400)
  })

  it('404s for an unknown user', async () => {
    expect((await put('nobody', dataUrl('image/png', PNG_1X1))).statusCode).toBe(404)
    expect((await del('nobody')).statusCode).toBe(404)
  })
})

describe('who may change whose picture', () => {
  it('any signed-in user may set and remove their own', async () => {
    const viewer = await createUserAndLogin(server, admin, 'vera', 'viewer')
    const id = await userId('vera')
    expect((await put(id, dataUrl('image/png', PNG_1X1), viewer)).statusCode).toBe(200)
    expect((await del(id, viewer)).statusCode).toBe(204)
    expect(await UserAvatarStore.for(server.adminStore).head(id)).toBeNull()
  })

  it('a user without users:manage may not touch anyone else’s', async () => {
    const operator = await createUserAndLogin(server, admin, 'otto', 'operator')
    await put(adminId, dataUrl('image/png', PNG_1X1))
    expect((await put(adminId, dataUrl('image/png', JPEG), operator)).statusCode).toBe(403)
    expect((await del(adminId, operator)).statusCode).toBe(403)
    expect((await UserAvatarStore.for(server.adminStore).head(adminId))?.contentType).toBe('image/png')
  })

  it('users:manage may set and remove another user’s', async () => {
    await createUserAndLogin(server, admin, 'vera', 'viewer')
    const id = await userId('vera')
    expect((await put(id, dataUrl('image/png', PNG_1X1))).statusCode).toBe(200)
    expect((await del(id)).statusCode).toBe(204)
  })

  it('a tenant-restricted manager may not change an account that sees more tenants', async () => {
    // A non-admin with users:manage, restricted to the default tenant. (Admins
    // always see every tenant, so a restricted manager is never an admin.)
    const manager = await createUserAndLogin(server, admin, 'manager', 'operator')
    const managerId = await userId('manager')
    const role = await server.fastify.inject({
      method: 'POST',
      url: '/api/roles',
      headers: auth(admin),
      payload: {
        name: 'Scoped manager',
        baseRole: 'operator',
        permissions: ['connections:read', 'dashboards:view', 'users:manage'],
      },
    })
    expect(role.statusCode, role.payload).toBe(201)
    for (const [url, payload] of [
      [`/api/users/${managerId}/role`, { roleId: role.json().data.id }],
      [`/api/users/${managerId}/scope`, { mode: 'restricted', grants: [{ tenantId: 'default', verticals: '*' }] }],
    ] as const) {
      const res = await server.fastify.inject({ method: 'PUT', url, headers: auth(admin), payload })
      expect(res.statusCode, res.payload).toBe(200)
    }
    // A viewer holds nothing the manager lacks, but sees every tenant.
    await createUserAndLogin(server, admin, 'vera', 'viewer')
    const veraId = await userId('vera')
    expect((await put(veraId, dataUrl('image/png', PNG_1X1), manager)).statusCode).toBe(403)
    expect((await del(veraId, manager)).statusCode).toBe(403)
    // Narrowed to the manager's own tenant, the viewer is fair game…
    const narrow = await server.fastify.inject({
      method: 'PUT',
      url: `/api/users/${veraId}/scope`,
      headers: auth(admin),
      payload: { mode: 'restricted', grants: [{ tenantId: 'default', verticals: '*' }] },
    })
    expect(narrow.statusCode).toBe(200)
    expect((await put(veraId, dataUrl('image/png', PNG_1X1), manager)).statusCode).toBe(200)
    // …an admin never is (it holds more), and the manager's own is always theirs.
    expect((await put(adminId, dataUrl('image/png', PNG_1X1), manager)).statusCode).toBe(403)
    expect((await put(managerId, dataUrl('image/png', PNG_1X1), manager)).statusCode).toBe(200)
  })

  it('needs a signed-in caller for every verb', async () => {
    for (const method of ['GET', 'PUT', 'DELETE'] as const) {
      const res = await server.fastify.inject({
        method,
        url: `/api/users/${adminId}/avatar`,
        ...(method === 'PUT' ? { payload: { data: PNG_1X1.toString('base64') } } : {}),
      })
      expect(res.statusCode, method).toBe(401)
    }
  })
})

describe('serving the picture', () => {
  it('serves the sniffed type with nosniff, a locked-down CSP, private caching and an ETag', async () => {
    await put(adminId, dataUrl('image/jpeg', JPEG))
    const viewer = await createUserAndLogin(server, admin, 'vera', 'viewer')
    // Any signed-in user may read anyone's picture.
    const res = await get(adminId, viewer)
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toBe('image/jpeg')
    expect(res.headers['x-content-type-options']).toBe('nosniff')
    expect(res.headers['content-security-policy']).toBe("default-src 'none'")
    expect(res.headers['cache-control']).toBe('private, max-age=300')
    const head = await UserAvatarStore.for(server.adminStore).head(adminId)
    expect(res.headers['etag']).toBe(`"${head!.sha256}"`)
  })

  it('answers a matching If-None-Match with 304 and no body', async () => {
    await put(adminId, dataUrl('image/png', PNG_1X1))
    const first = await get(adminId)
    const again = await get(adminId, admin, { 'if-none-match': String(first.headers['etag']) })
    expect(again.statusCode).toBe(304)
    expect(again.rawPayload.length).toBe(0)
  })

  it('404s when the user has no picture', async () => {
    expect((await get(adminId)).statusCode).toBe(404)
  })

  it('versions the URL in every user view so a new picture busts caches', async () => {
    const first = (await put(adminId, dataUrl('image/png', PNG_1X1))).json().data
    expect(first.avatarUrl).toBe(`/api/users/${adminId}/avatar?v=${first.avatarVersion}`)

    const me = await server.fastify.inject({ method: 'GET', url: '/api/auth/me', headers: auth(admin) })
    expect(me.json().user.avatarUrl).toBe(first.avatarUrl)
    const detail = await server.fastify.inject({ method: 'GET', url: `/api/users/${adminId}`, headers: auth(admin) })
    expect(detail.json().data.avatarVersion).toBe(first.avatarVersion)
    expect(detail.json().data.avatarSource).toBe('upload')
    const list = await server.fastify.inject({ method: 'GET', url: '/api/users', headers: auth(admin) })
    expect(list.json().data[0].avatarUrl).toBe(first.avatarUrl)

    const second = (await put(adminId, dataUrl('image/jpeg', JPEG))).json().data
    expect(second.avatarVersion).not.toBe(first.avatarVersion)
  })

  it('audits uploads and removals by who did it and to whom, without the bytes', async () => {
    await createUserAndLogin(server, admin, 'vera', 'viewer')
    const id = await userId('vera')
    await put(id, dataUrl('image/png', PNG_1X1))
    await del(id)
    await del(id) // nothing left to remove: no second entry
    const rows = (await server.adminStore.listAudit(100, 0)).filter((r) =>
      r.action.startsWith('user.avatar_'),
    )
    expect(rows.map((r) => r.action).sort()).toEqual(['user.avatar_delete', 'user.avatar_update'])
    for (const r of rows) {
      expect(r.user_id).toBe(adminId)
      expect(r.target_id).toBe(id)
    }
    const update = rows.find((r) => r.action === 'user.avatar_update')!
    expect(JSON.parse(update.detail!)).toEqual({ contentType: 'image/png', byteSize: PNG_1X1.length })
  })

  it('an upload replaces an IdP picture and becomes the owner', async () => {
    const avatars = UserAvatarStore.for(server.adminStore)
    await avatars.put({ userId: adminId, contentType: 'image/png', bytes: PNG_1X1, source: 'idp', sourceUrlHash: 'x', updatedBy: null })
    await put(adminId, dataUrl('image/jpeg', JPEG))
    const head = await avatars.head(adminId)
    expect(head?.source).toBe('upload')
    expect(head?.sourceUrlHash).toBeNull()
  })
})
