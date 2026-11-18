/**
 * Journey: any signed-in user — a viewer here — manages their own picture on
 * /profile, linked from the header, with the same no-JS multipart form the
 * admin user page uses. The routes act on the session's own account only:
 * there is no id to tamper with. admin-api allows self-service and is the
 * real gate.
 */
import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHmac } from 'crypto'

const VERSION = '9f86d081884c7d65'
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

const mockGetMyAccess = vi.fn()
const mockGetMyProfile = vi.fn()
const mockSetUserAvatar = vi.fn()
const mockDeleteUserAvatar = vi.fn()

vi.mock('../../src/core/proxy/admin-api-client', async () => {
  const { adminApiStub } = await import('../helpers/admin-api-stub')
  return {
    AdminApiClient: adminApiStub({
      getMyAccess: mockGetMyAccess,
      getMyProfile: mockGetMyProfile,
      setUserAvatar: mockSetUserAvatar,
      deleteUserAvatar: mockDeleteUserAvatar,
      getLoginOptions: async () => ({ providers: [], localLoginEnabled: true }),
    }),
  }
})

const { buildServer } = await import('../../src/core/server')
const { flashOf } = await import('../helpers/flash')

const SESSION_SECRET = 'my-profile-session-secret-long-enough'
let fastify: FastifyInstance
let seq = 0

function session() {
  seq += 1
  return fastify.signCookie(
    JSON.stringify({ id: 'usr_vera', username: 'vera.viewer', role: 'viewer', token: `jwt-${seq}` }),
  )
}
const csrfFor = (c: string) => createHmac('sha256', SESSION_SECRET).update(c).digest('hex').slice(0, 32)

function get(url: string) {
  return fastify.inject({ method: 'GET', url, cookies: { session: session() } })
}
function post(url: string) {
  const c = session()
  return fastify.inject({ method: 'POST', url, cookies: { session: c }, payload: { _csrf: csrfFor(c) } })
}
function upload(url: string, bytes: Buffer, type = 'image/png') {
  const c = session()
  const b = '----my-profile-boundary'
  const payload = Buffer.concat([
    Buffer.from(
      `--${b}\r\nContent-Disposition: form-data; name="_csrf"\r\n\r\n${csrfFor(c)}\r\n` +
        `--${b}\r\nContent-Disposition: form-data; name="avatar"; filename="me.png"\r\nContent-Type: ${type}\r\n\r\n`,
    ),
    bytes,
    Buffer.from(`\r\n--${b}--\r\n`),
  ])
  return fastify.inject({
    method: 'POST',
    url,
    cookies: { session: c },
    headers: { 'content-type': `multipart/form-data; boundary=${b}` },
    payload,
  })
}
const flashes = (res: Parameters<typeof flashOf>[1]) =>
  flashOf(fastify, res)
    .map((m) => m.body)
    .join('\n')

beforeEach(async () => {
  for (const m of [mockGetMyAccess, mockGetMyProfile, mockSetUserAvatar, mockDeleteUserAvatar]) m.mockReset()
  mockGetMyAccess.mockResolvedValue({
    roleId: 'viewer',
    roleName: 'viewer',
    permissions: ['connections:read', 'dashboards:view'],
    scope: { mode: 'all', grants: [] },
    avatarVersion: null,
  })
  mockGetMyProfile.mockResolvedValue({
    id: 'usr_vera',
    username: 'vera.viewer',
    role: 'viewer',
    email: 'vera@northwind.example',
    avatarVersion: null,
  })
  const built = await buildServer({
    server: { port: 0, host: '127.0.0.1' },
    session: { secret: SESSION_SECRET },
    admin_api: { url: 'http://localhost:3001' },
    docs_server: { url: 'http://localhost:3003' },
    sso: { publicBaseUrl: 'http://localhost:3000' },
  })
  fastify = built.fastify
  await fastify.ready()
})

afterEach(async () => {
  await fastify?.close()
})

describe('Journey: the header follows a picture change at once', () => {
  // One session across requests: the shell caches /me per session token, and
  // a fresh token per request (as `get`/`upload` use) would hide a stale cache.
  function sameSession() {
    const c = fastify.signCookie(
      JSON.stringify({ id: 'usr_vera', username: 'vera.viewer', role: 'viewer', token: 'jwt-one-session' }),
    )
    return {
      get: (url: string) => fastify.inject({ method: 'GET', url, cookies: { session: c } }),
      post: (url: string, payload: Buffer | Record<string, string>, headers: Record<string, string> = {}) =>
        fastify.inject({ method: 'POST', url, cookies: { session: c }, headers, payload }),
      csrf: csrfFor(c),
    }
  }
  const headerOf = (body: string) => /<header class="app-header">[\s\S]*?<\/header>/.exec(body)?.[0] ?? ''
  const withVersion = (avatarVersion: string | null) => ({
    roleId: 'viewer',
    roleName: 'viewer',
    permissions: ['connections:read', 'dashboards:view'],
    scope: { mode: 'all', grants: [] },
    avatarVersion,
  })

  it('shows an uploaded picture in the header on the very next page, without signing in again', async () => {
    const s = sameSession()
    expect(headerOf((await s.get('/connections')).body)).not.toContain('/avatar?v=')

    mockSetUserAvatar.mockResolvedValue({ avatarUrl: `/api/users/usr_vera/avatar?v=${VERSION}`, avatarVersion: VERSION })
    mockGetMyAccess.mockResolvedValue(withVersion(VERSION))
    const b = '----same-session-boundary'
    const payload = Buffer.concat([
      Buffer.from(
        `--${b}\r\nContent-Disposition: form-data; name="_csrf"\r\n\r\n${s.csrf}\r\n` +
          `--${b}\r\nContent-Disposition: form-data; name="avatar"; filename="me.png"\r\nContent-Type: image/png\r\n\r\n`,
      ),
      PNG,
      Buffer.from(`\r\n--${b}--\r\n`),
    ])
    const up = await s.post('/profile/avatar', payload, { 'content-type': `multipart/form-data; boundary=${b}` })
    expect(up.statusCode).toBe(302)

    expect(headerOf((await s.get('/profile')).body)).toContain(`/users/usr_vera/avatar?v=${VERSION}`)
  })

  it('drops a removed picture from the header on the very next page', async () => {
    mockGetMyAccess.mockResolvedValue(withVersion(VERSION))
    const s = sameSession()
    expect(headerOf((await s.get('/connections')).body)).toContain(`/avatar?v=${VERSION}`)

    mockDeleteUserAvatar.mockResolvedValue(undefined)
    mockGetMyAccess.mockResolvedValue(withVersion(null))
    const del = await s.post('/profile/avatar/delete', { _csrf: s.csrf })
    expect(del.statusCode).toBe(302)

    expect(headerOf((await s.get('/profile')).body)).not.toContain('/avatar?v=')
  })
})

describe('Journey: a viewer manages their own picture', () => {
  it('reaches /profile from the header', async () => {
    const res = await get('/connections')
    const header = /<header class="app-header">[\s\S]*?<\/header>/.exec(res.body)?.[0] ?? ''
    expect(header).toContain('href="/profile"')
  })

  it('shows their name, email and initials, with a no-JS upload form and no remove', async () => {
    const res = await get('/profile')
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('vera.viewer')
    expect(res.body).toContain('vera@northwind.example')
    expect(res.body).toContain('avatar--lg avatar--initials" data-initials="VV"')
    expect(res.body).toContain('action="/profile/avatar" enctype="multipart/form-data"')
    expect(res.body).toContain('accept="image/png,image/jpeg,image/webp"')
    expect(res.body).not.toContain('action="/profile/avatar/delete"')
    // The email is shown, not edited: changing it is an admin's job.
    expect(res.body).not.toContain('name="email"')
  })

  it('shows the current picture and offers to remove it', async () => {
    mockGetMyProfile.mockResolvedValue({
      id: 'usr_vera',
      username: 'vera.viewer',
      role: 'viewer',
      email: null,
      avatarVersion: VERSION,
    })
    const res = await get('/profile')
    expect(res.body).toContain(`src="/users/usr_vera/avatar?v=${VERSION}"`)
    expect(res.body).toContain('action="/profile/avatar/delete"')
  })

  it('uploads to their own account, as base64, and says so', async () => {
    mockSetUserAvatar.mockResolvedValue(undefined)
    const res = await upload('/profile/avatar', PNG)
    expect(res.statusCode).toBe(302)
    expect(res.headers['location']).toBe('/profile')
    expect(mockSetUserAvatar).toHaveBeenCalledWith(expect.any(String), 'usr_vera', PNG.toString('base64'))
    expect(flashes(res)).toContain('Picture updated.')
  })

  it('reports a refusal from admin-api', async () => {
    mockSetUserAvatar.mockRejectedValue({ response: { data: { error: 'Only PNG, JPEG and WebP pictures are accepted' } } })
    const res = await upload('/profile/avatar', Buffer.from('<svg/>'), 'image/svg+xml')
    expect(res.statusCode).toBe(302)
    expect(flashes(res)).toContain('Only PNG, JPEG and WebP pictures are accepted')
  })

  it('removes their own picture', async () => {
    mockDeleteUserAvatar.mockResolvedValue(undefined)
    const res = await post('/profile/avatar/delete')
    expect(res.statusCode).toBe(302)
    expect(mockDeleteUserAvatar).toHaveBeenCalledWith(expect.any(String), 'usr_vera')
    expect(flashes(res)).toContain('Picture removed.')
  })

  it('refuses an upload without the CSRF token', async () => {
    const res = await fastify.inject({
      method: 'POST',
      url: '/profile/avatar',
      cookies: { session: session() },
      headers: { 'content-type': 'multipart/form-data; boundary=b' },
      payload: '--b\r\nContent-Disposition: form-data; name="avatar"; filename="a.png"\r\nContent-Type: image/png\r\n\r\nx\r\n--b--\r\n',
    })
    expect(res.statusCode).toBe(403)
    expect(mockSetUserAvatar).not.toHaveBeenCalled()
  })

  it('sends a signed-out browser to the login page', async () => {
    const res = await fastify.inject({ method: 'GET', url: '/profile' })
    expect(res.statusCode).toBe(302)
    expect(res.headers['location']).toBe('/login')
  })
})
