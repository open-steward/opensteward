/**
 * SCIM `emails` and `photos` reach the console user — on create, replace and
 * patch — with the same precedence as SSO: an admin's email and an uploaded
 * picture are never overwritten.
 *
 * The picture fetch is stubbed; nothing here reaches the network.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildAdminApiTestServer, setupAdmin, type AdminApiTestServer } from '../journeys/helpers'
import { UserAvatarStore } from '../../src/core/db/user-avatar-store'
import { profileFromPatch } from '../../src/core/routes/scim'
import { pickPhoto } from '../../src/core/auth/idp/scim-schema'
import { JPEG, PNG_1X1 } from './avatar-fixtures'

const PATCH_SCHEMA = 'urn:ietf:params:scim:api:messages:2.0:PatchOp'

let server: AdminApiTestServer
let admin: string
let scimToken: string
const fetchAvatar = vi.fn(async (url: string) => ({
  bytes: url.includes('thumb') ? JPEG : PNG_1X1,
  contentType: (url.includes('thumb') ? 'image/jpeg' : 'image/png') as 'image/jpeg' | 'image/png',
}))

beforeEach(async () => {
  fetchAvatar.mockClear()
  server = await buildAdminApiTestServer({ avatarFetcher: fetchAvatar })
  admin = await setupAdmin(server)
  const idp = await server.fastify.inject({
    method: 'POST',
    url: '/api/identity-providers',
    headers: { authorization: `Bearer ${admin}` },
    payload: {
      name: 'Okta SCIM',
      slug: 'okta-scim',
      protocol: 'oidc',
      enabled: true,
      config: { issuer: 'https://okta.northwind.example', clientId: 'opensteward' },
    },
  })
  expect(idp.statusCode).toBe(201)
  const mint = await server.fastify.inject({
    method: 'POST',
    url: `/api/identity-providers/${idp.json().data.id}/scim-tokens`,
    headers: { authorization: `Bearer ${admin}` },
    payload: {},
  })
  scimToken = mint.json().data.plaintext as string
})

afterEach(async () => {
  await server?.cleanup()
})

function scim(method: 'POST' | 'PUT' | 'PATCH', url: string, payload: unknown) {
  return server.fastify.inject({
    method,
    url,
    headers: { authorization: `Bearer ${scimToken}` },
    payload: payload as Record<string, unknown>,
  })
}

async function provision(extra: Record<string, unknown> = {}): Promise<string> {
  const res = await scim('POST', '/scim/v2/Users', {
    schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
    userName: 'alice.provisioned',
    active: true,
    ...extra,
  })
  expect(res.statusCode, res.payload).toBe(201)
  await server.idpProfileSync.idle()
  return res.json().id as string
}

describe('SCIM create', () => {
  it('stores the primary email as idp-owned, and fetches the photo', async () => {
    const id = await provision({
      emails: [
        { value: 'other@northwind.example', type: 'home' },
        { value: 'alice@northwind.example', type: 'work', primary: true },
      ],
      photos: [
        { value: 'https://pics.example/thumb.jpg', type: 'thumbnail' },
        { value: 'https://pics.example/photo.png', type: 'photo' },
      ],
    })
    const user = await server.adminStore.getUserById(id)
    expect(user?.email).toBe('alice@northwind.example')
    expect(user?.email_source).toBe('idp')
    // `photo` wins over `thumbnail`.
    expect(fetchAvatar).toHaveBeenCalledWith('https://pics.example/photo.png')
    const head = await UserAvatarStore.for(server.adminStore).head(id)
    expect(head?.source).toBe('idp')
    expect(head?.contentType).toBe('image/png')

    // The user view shows both.
    const detail = await server.fastify.inject({
      method: 'GET',
      url: `/api/users/${id}`,
      headers: { authorization: `Bearer ${admin}` },
    })
    expect(detail.json().data.email).toBe('alice@northwind.example')
    expect(detail.json().data.emailSource).toBe('idp')
    expect(detail.json().data.avatarSource).toBe('idp')
    expect(detail.json().data.avatarUrl).toMatch(/\/avatar\?v=[0-9a-f]{16}$/)
  })

  it('takes the first email when none is primary', async () => {
    const id = await provision({ emails: [{ value: 'first@northwind.example' }, { value: 'second@northwind.example' }] })
    expect((await server.adminStore.getUserById(id))?.email).toBe('first@northwind.example')
  })

  it('ignores an invalid email and a picture it cannot fetch, and still provisions', async () => {
    fetchAvatar.mockRejectedValueOnce(new Error('boom'))
    const id = await provision({
      emails: [{ value: 'not-an-email', primary: true }],
      photos: [{ value: 'https://pics.example/p.png', type: 'photo' }],
    })
    expect((await server.adminStore.getUserById(id))?.email ?? null).toBeNull()
    expect(await UserAvatarStore.for(server.adminStore).head(id)).toBeNull()
  })
})

describe('SCIM replace and patch', () => {
  it('a replace refreshes an idp-owned email and a changed photo URL', async () => {
    const id = await provision({
      emails: [{ value: 'alice@northwind.example', primary: true }],
      photos: [{ value: 'https://pics.example/photo.png', type: 'photo' }],
    })
    const put = await scim('PUT', `/scim/v2/Users/${id}`, {
      schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
      userName: 'alice.provisioned',
      active: true,
      emails: [{ value: 'alice.new@northwind.example', primary: true }],
      photos: [{ value: 'https://pics.example/thumb-2.jpg', type: 'thumbnail' }],
    })
    expect(put.statusCode).toBe(200)
    expect(put.json().emails).toEqual([{ value: 'alice.new@northwind.example', primary: true }])
    await server.idpProfileSync.idle()
    expect((await server.adminStore.getUserById(id))?.email).toBe('alice.new@northwind.example')
    expect((await UserAvatarStore.for(server.adminStore).head(id))?.contentType).toBe('image/jpeg')
  })

  it('never overwrites an email an admin set, nor an uploaded picture', async () => {
    const id = await provision({ emails: [{ value: 'alice@northwind.example', primary: true }] })
    const patchAdmin = await server.fastify.inject({
      method: 'PATCH',
      url: `/api/users/${id}`,
      headers: { authorization: `Bearer ${admin}` },
      payload: { email: 'chosen@console.example' },
    })
    expect(patchAdmin.statusCode).toBe(200)
    const upload = await server.fastify.inject({
      method: 'PUT',
      url: `/api/users/${id}/avatar`,
      headers: { authorization: `Bearer ${admin}` },
      payload: { data: JPEG.toString('base64') },
    })
    expect(upload.statusCode).toBe(200)
    fetchAvatar.mockClear()

    const res = await scim('PATCH', `/scim/v2/Users/${id}`, {
      schemas: [PATCH_SCHEMA],
      Operations: [
        { op: 'replace', path: 'emails', value: [{ value: 'idp@northwind.example', primary: true }] },
        { op: 'replace', path: 'photos', value: [{ value: 'https://pics.example/new.png', type: 'photo' }] },
      ],
    })
    expect(res.statusCode).toBe(200)
    await server.idpProfileSync.idle()
    const user = await server.adminStore.getUserById(id)
    expect(user?.email).toBe('chosen@console.example')
    expect(user?.email_source).toBe('manual')
    expect(fetchAvatar).not.toHaveBeenCalled()
    expect((await UserAvatarStore.for(server.adminStore).head(id))?.source).toBe('upload')
  })

  it('understands Entra ID’s filtered-path email replace', async () => {
    const id = await provision({ emails: [{ value: 'alice@northwind.example', primary: true }] })
    const res = await scim('PATCH', `/scim/v2/Users/${id}`, {
      schemas: [PATCH_SCHEMA],
      Operations: [{ op: 'Replace', path: 'emails[type eq "work"].value', value: 'alice.entra@northwind.example' }],
    })
    expect(res.statusCode).toBe(200)
    expect((await server.adminStore.getUserById(id))?.email).toBe('alice.entra@northwind.example')
  })

  it('a remove of emails or photos drops only IdP-owned data', async () => {
    const id = await provision({
      emails: [{ value: 'alice@northwind.example', primary: true }],
      photos: [{ value: 'https://pics.example/photo.png', type: 'photo' }],
    })
    const res = await scim('PATCH', `/scim/v2/Users/${id}`, {
      schemas: [PATCH_SCHEMA],
      Operations: [
        { op: 'remove', path: 'emails' },
        { op: 'remove', path: 'photos' },
      ],
    })
    expect(res.statusCode).toBe(200)
    expect((await server.adminStore.getUserById(id))?.email ?? null).toBeNull()
    expect(await UserAvatarStore.for(server.adminStore).head(id)).toBeNull()
  })
})

describe('parsing', () => {
  it('pickPhoto prefers photo, then thumbnail, then the first entry', () => {
    expect(pickPhoto({ photos: [{ value: 't', type: 'thumbnail' }, { value: 'p', type: 'photo' }] })).toBe('p')
    expect(pickPhoto({ photos: [{ value: 'x', type: 'other' }, { value: 't', type: 'thumbnail' }] })).toBe('t')
    expect(pickPhoto({ photos: [{ value: 'x' }] })).toBe('x')
    expect(pickPhoto({})).toBeNull()
  })

  it('profileFromPatch reads path, filtered-path and path-less forms', () => {
    expect(
      profileFromPatch([
        { op: 'add', value: { emails: [{ value: 'a@b.example', primary: true }], photos: [{ value: 'https://p/1', type: 'photo' }] } },
      ]),
    ).toEqual({ email: 'a@b.example', pictureUrl: 'https://p/1', removeEmail: false, removePhotos: false })
    expect(
      profileFromPatch([{ op: 'replace', value: { 'emails[type eq "work"].value': 'c@d.example' } }]).email,
    ).toBe('c@d.example')
    expect(profileFromPatch([{ op: 'replace', path: 'active', value: false }])).toEqual({
      removeEmail: false,
      removePhotos: false,
    })
  })
})
