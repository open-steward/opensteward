/**
 * Journey: console-user email and profile picture in the admin UI.
 *
 * Pinned here:
 *   - the avatar renders in the header, the users list and user detail, as
 *     a same-origin versioned <img> — or as initials when there is none;
 *   - the email field on the new-user form and the detail page, forwarded
 *     to admin-api (blank clears);
 *   - the picture uploads from a plain multipart form (no JS), is forwarded
 *     as base64 without the browser's content type, and can be removed;
 *   - the same-origin picture proxy: any signed-in user, image types only,
 *     nosniff + `default-src 'none'`, ETag/304 passed through.
 */
import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHmac } from 'crypto'

const USER_ID = 'usr_01HQ8ZKX7M2P4R6T8V0W'
const VERSION = '9f86d081884c7d65'
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

const mockGetMyAccess = vi.fn()
const mockListUsers = vi.fn()
const mockGetUser = vi.fn()
const mockCreateUser = vi.fn()
const mockUpdateUser = vi.fn()
const mockGetUserAvatar = vi.fn()
const mockSetUserAvatar = vi.fn()
const mockDeleteUserAvatar = vi.fn()
const mockCreateIdentityProvider = vi.fn()

vi.mock('../../src/core/proxy/admin-api-client', async () => {
  const { adminApiStub } = await import('../helpers/admin-api-stub')
  return {
    AdminApiClient: adminApiStub({
      getMyAccess: mockGetMyAccess,
      listUsers: mockListUsers,
      getUser: mockGetUser,
      createUser: mockCreateUser,
      updateUser: mockUpdateUser,
      getUserAvatar: mockGetUserAvatar,
      setUserAvatar: mockSetUserAvatar,
      deleteUserAvatar: mockDeleteUserAvatar,
      createIdentityProvider: mockCreateIdentityProvider,
      getLoginOptions: async () => ({ providers: [], localLoginEnabled: true }),
    }),
  }
})

const { buildServer } = await import('../../src/core/server')
const { avatarInitials } = await import('../../src/core/views/helpers')
const { flashOf } = await import('../helpers/flash')

const SESSION_SECRET = 'user-profile-session-secret-long-enough'
let fastify: FastifyInstance
let seq = 0

type Role = 'viewer' | 'operator' | 'admin'

function session(role: Role, username = 'olivia.admin') {
  seq += 1
  return fastify.signCookie(JSON.stringify({ id: 'u1', username, role, token: `jwt-${seq}` }))
}
function csrfFor(cookie: string) {
  return createHmac('sha256', SESSION_SECRET).update(cookie).digest('hex').slice(0, 32)
}
function get(url: string, role: Role = 'admin', headers: Record<string, string> = {}) {
  return fastify.inject({ method: 'GET', url, cookies: { session: session(role) }, headers })
}
function post(url: string, body: Record<string, string>, role: Role = 'admin') {
  const c = session(role)
  return fastify.inject({
    method: 'POST',
    url,
    cookies: { session: c },
    payload: { _csrf: csrfFor(c), ...body },
  })
}

/** A browser's multipart upload of one file field. */
function upload(url: string, file: { name: string; type: string; bytes: Buffer }, role: Role = 'admin') {
  const c = session(role)
  const boundary = '----opensteward-test-boundary'
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="_csrf"\r\n\r\n${csrfFor(c)}\r\n` +
        `--${boundary}\r\nContent-Disposition: form-data; name="avatar"; filename="${file.name}"\r\n` +
        `Content-Type: ${file.type}\r\n\r\n`,
    ),
    file.bytes,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ])
  return fastify.inject({
    method: 'POST',
    url,
    cookies: { session: c },
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
    payload: body,
  })
}

function flashesOf(res: Parameters<typeof flashOf>[1]): string {
  return flashOf(fastify, res)
    .map((m) => m.body)
    .join('\n')
}

const ACCESS = {
  roleId: 'admin',
  roleName: 'admin',
  permissions: ['users:manage'],
  scope: { mode: 'all', grants: [] },
}

function account(extra: Record<string, unknown> = {}) {
  return {
    id: USER_ID,
    username: 'olivia.admin',
    role: 'admin',
    email: 'olivia@northwind.example',
    emailSource: 'idp',
    avatarVersion: VERSION,
    avatarSource: 'idp',
    createdAt: '2026-01-04T10:00:00.000Z',
    updatedAt: '2026-02-11T16:30:00.000Z',
    links: [],
    ssoOnly: false,
    isLocalAdmin: true,
    isPinnedBreakGlass: false,
    ...extra,
  }
}

beforeEach(async () => {
  for (const m of [
    mockGetMyAccess,
    mockListUsers,
    mockGetUser,
    mockCreateUser,
    mockUpdateUser,
    mockGetUserAvatar,
    mockSetUserAvatar,
    mockDeleteUserAvatar,
    mockCreateIdentityProvider,
  ]) {
    m.mockReset()
  }
  mockGetMyAccess.mockResolvedValue({ ...ACCESS, avatarVersion: null })
  mockListUsers.mockResolvedValue([])
  mockGetUser.mockResolvedValue(account())
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

describe('avatar rendering', () => {
  it('shows the signed-in user’s picture in the header, versioned and same-origin', async () => {
    mockGetMyAccess.mockResolvedValue({ ...ACCESS, avatarVersion: VERSION })
    const res = await get('/users')
    expect(res.statusCode).toBe(200)
    const header = /<header class="app-header">[\s\S]*?<\/header>/.exec(res.body)?.[0] ?? ''
    expect(header).toContain(`<img class="avatar avatar--sm" src="/users/u1/avatar?v=${VERSION}"`)
  })

  it('falls back to initials in the header when there is no picture', async () => {
    const res = await get('/users')
    const header = /<header class="app-header">[\s\S]*?<\/header>/.exec(res.body)?.[0] ?? ''
    expect(header).toContain('data-initials="OA"')
    expect(header).not.toContain('/avatar?v=')
  })

  it('shows a picture or initials, and the email, on every row of the users list', async () => {
    mockListUsers.mockResolvedValue([
      { id: 'a', username: 'alpha', role: 'admin', email: 'alpha@x.example', avatarVersion: VERSION },
      { id: 'b', username: 'bravo.two', role: 'viewer', email: null, avatarVersion: null },
    ])
    const res = await get('/users')
    expect(res.body).toContain(`src="/users/a/avatar?v=${VERSION}"`)
    expect(res.body).toContain('data-initials="BT"')
    expect(res.body).toContain('alpha@x.example')
  })

  it('shows a large picture, the email and its source on user detail', async () => {
    const res = await get(`/users/${USER_ID}`)
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain(`<img class="avatar avatar--lg" src="/users/${USER_ID}/avatar?v=${VERSION}"`)
    expect(res.body).toContain('olivia@northwind.example')
    expect(res.body).toContain('from IdP')
  })

  it('renders initials on user detail when there is no picture, and offers no Remove', async () => {
    mockGetUser.mockResolvedValue(account({ avatarVersion: null, avatarSource: null }))
    const res = await get(`/users/${USER_ID}`)
    expect(res.body).toContain('avatar--lg avatar--initials" data-initials="OA"')
    expect(res.body).not.toContain(`/users/${USER_ID}/avatar/delete`)
  })

  it('computes initials from the name, ignoring an email domain', () => {
    expect(avatarInitials('olivia.admin')).toBe('OA')
    expect(avatarInitials('alice@example.test')).toBe('A')
    expect(avatarInitials('Ana María Pérez')).toBe('AM')
    expect(avatarInitials('')).toBe('?')
  })
})

describe('email', () => {
  it('the new-user form has an optional email field, forwarded to admin-api', async () => {
    const form = await get('/users/new')
    expect(form.body).toContain('type="email" name="email"')
    mockCreateUser.mockResolvedValue({ id: 'x', username: 'nina', role: 'viewer' })
    const res = await post('/users', {
      username: 'nina',
      password: 'SecurePass123!',
      role: 'viewer',
      email: ' nina@northwind.example ',
    })
    expect(res.statusCode).toBe(302)
    expect(mockCreateUser).toHaveBeenCalledWith(expect.any(String), 'nina', 'SecurePass123!', 'viewer', 'nina@northwind.example')
  })

  it('leaves email out of the create call when blank', async () => {
    mockCreateUser.mockResolvedValue({ id: 'x', username: 'nina', role: 'viewer' })
    await post('/users', { username: 'nina', password: 'SecurePass123!', role: 'viewer', email: '' })
    expect(mockCreateUser).toHaveBeenCalledWith(expect.any(String), 'nina', 'SecurePass123!', 'viewer', undefined)
  })

  it('keeps what was typed when admin-api refuses the address', async () => {
    mockCreateUser.mockRejectedValue({ response: { data: { error: 'email: Invalid email address' } } })
    const res = await post('/users', { username: 'nina', password: 'SecurePass123!', role: 'viewer', email: 'nope' })
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('Invalid email address')
    expect(res.body).toContain('value="nope"')
    expect(res.body).toContain('value="nina"')
  })

  it('the detail page edits the email; blank clears it', async () => {
    const page = await get(`/users/${USER_ID}`)
    expect(page.body).toContain(`action="/users/${USER_ID}/email"`)
    expect(page.body).toContain('value="olivia@northwind.example"')

    mockUpdateUser.mockResolvedValue({})
    const set = await post(`/users/${USER_ID}/email`, { email: 'o@console.example' })
    expect(set.statusCode).toBe(302)
    expect(set.headers['location']).toBe(`/users/${USER_ID}`)
    expect(mockUpdateUser).toHaveBeenLastCalledWith(expect.any(String), USER_ID, { email: 'o@console.example' })

    await post(`/users/${USER_ID}/email`, { email: '  ' })
    expect(mockUpdateUser).toHaveBeenLastCalledWith(expect.any(String), USER_ID, { email: null })
  })

  it('reports admin-api’s refusal as a flash', async () => {
    mockUpdateUser.mockRejectedValue({ response: { data: { error: 'email: Invalid email address' } } })
    const res = await post(`/users/${USER_ID}/email`, { email: 'bad' })
    expect(res.statusCode).toBe(302)
    expect(flashesOf(res)).toContain('Invalid email address')
  })
})

describe('picture upload and removal (no JS)', () => {
  it('the detail page carries a multipart upload form and a remove form', async () => {
    const res = await get(`/users/${USER_ID}`)
    expect(res.body).toContain(`action="/users/${USER_ID}/avatar" enctype="multipart/form-data"`)
    expect(res.body).toContain('type="file" id="profile-avatar" name="avatar" accept="image/png,image/jpeg,image/webp"')
    expect(res.body).toContain(`action="/users/${USER_ID}/avatar/delete"`)
  })

  it('forwards the bytes as base64, and never the browser’s declared type', async () => {
    mockSetUserAvatar.mockResolvedValue(undefined)
    const res = await upload(`/users/${USER_ID}/avatar`, { name: 'me.svg', type: 'image/svg+xml', bytes: PNG })
    expect(res.statusCode).toBe(302)
    expect(res.headers['location']).toBe(`/users/${USER_ID}`)
    expect(mockSetUserAvatar).toHaveBeenCalledWith(expect.any(String), USER_ID, PNG.toString('base64'))
    expect(flashesOf(res)).toContain('Picture updated.')
  })

  it('surfaces admin-api’s refusal (SVG, a stranger’s picture) as a flash', async () => {
    mockSetUserAvatar.mockRejectedValue({ response: { data: { error: 'Only PNG, JPEG and WebP pictures are accepted' } } })
    const res = await upload(`/users/${USER_ID}/avatar`, { name: 'x.svg', type: 'image/svg+xml', bytes: Buffer.from('<svg/>') })
    expect(res.statusCode).toBe(302)
    expect(flashesOf(res)).toContain('Only PNG, JPEG and WebP pictures are accepted')
  })

  it('refuses an empty or oversized file without calling admin-api', async () => {
    const empty = await upload(`/users/${USER_ID}/avatar`, { name: 'e.png', type: 'image/png', bytes: Buffer.alloc(0) })
    expect(flashesOf(empty)).toContain('Choose a PNG, JPEG or WebP picture')
    const big = await upload(`/users/${USER_ID}/avatar`, {
      name: 'big.png',
      type: 'image/png',
      bytes: Buffer.concat([PNG.subarray(0, 8), Buffer.alloc(530 * 1024)]),
    })
    expect(flashesOf(big)).toContain('larger than 512 KB')
    expect(mockSetUserAvatar).not.toHaveBeenCalled()
    // Past the multipart body limit Fastify itself answers 413.
    const huge = await upload(`/users/${USER_ID}/avatar`, { name: 'h.png', type: 'image/png', bytes: Buffer.alloc(900 * 1024) })
    expect(huge.statusCode).toBe(413)
  })

  it('refuses a multipart post without the CSRF token', async () => {
    const boundary = 'b'
    const res = await fastify.inject({
      method: 'POST',
      url: `/users/${USER_ID}/avatar`,
      cookies: { session: session('admin') },
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: `--${boundary}\r\nContent-Disposition: form-data; name="avatar"; filename="a.png"\r\nContent-Type: image/png\r\n\r\nx\r\n--${boundary}--\r\n`,
    })
    expect(res.statusCode).toBe(403)
    expect(mockSetUserAvatar).not.toHaveBeenCalled()
  })

  it('removes the picture', async () => {
    mockDeleteUserAvatar.mockResolvedValue(undefined)
    const res = await post(`/users/${USER_ID}/avatar/delete`, {})
    expect(res.statusCode).toBe(302)
    expect(mockDeleteUserAvatar).toHaveBeenCalledWith(expect.any(String), USER_ID)
    expect(flashesOf(res)).toContain('Picture removed.')
  })

  it('keeps the write routes admin-only, like the page they sit on', async () => {
    const res = await post(`/users/${USER_ID}/avatar/delete`, {}, 'operator')
    expect(res.statusCode).toBe(403)
    expect(mockDeleteUserAvatar).not.toHaveBeenCalled()
  })
})

describe('SAML picture attribute on the provider form', () => {
  it('offers the field and forwards it only when set', async () => {
    const form = await get('/identity-providers/new')
    expect(form.body).toContain('name="pictureAttribute"')

    mockCreateIdentityProvider.mockResolvedValue({})
    const base = {
      name: 'Okta',
      slug: 'okta',
      protocol: 'saml',
      entryPoint: 'https://idp.example/sso',
      idpIssuer: 'https://idp.example',
      spEntityId: 'opensteward',
    }
    await post('/identity-providers', { ...base, pictureAttribute: ' photoUrl ' })
    expect(mockCreateIdentityProvider.mock.calls[0]![1].config).toMatchObject({ pictureAttribute: 'photoUrl' })
    await post('/identity-providers', { ...base, pictureAttribute: '' })
    expect(mockCreateIdentityProvider.mock.calls[1]![1].config).not.toHaveProperty('pictureAttribute')
  })
})

describe('the same-origin picture proxy', () => {
  it('serves the picture to any signed-in user with locked-down headers', async () => {
    mockGetUserAvatar.mockResolvedValue({ status: 200, bytes: PNG, contentType: 'image/png', etag: '"abc"' })
    const res = await get(`/users/${USER_ID}/avatar?v=${VERSION}`, 'viewer')
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toBe('image/png')
    expect(res.headers['x-content-type-options']).toBe('nosniff')
    expect(res.headers['content-security-policy']).toBe("default-src 'none'")
    expect(res.headers['cache-control']).toBe('private, max-age=300')
    expect(res.headers['etag']).toBe('"abc"')
    expect(Buffer.compare(res.rawPayload, PNG)).toBe(0)
    // No shell data is fetched for a picture.
    expect(mockGetMyAccess).not.toHaveBeenCalled()
  })

  it('passes If-None-Match through and answers 304', async () => {
    mockGetUserAvatar.mockResolvedValue({ status: 304, bytes: Buffer.alloc(0), contentType: null, etag: '"abc"' })
    const res = await get(`/users/${USER_ID}/avatar`, 'viewer', { 'if-none-match': '"abc"' })
    expect(res.statusCode).toBe(304)
    expect(mockGetUserAvatar).toHaveBeenCalledWith(expect.any(String), USER_ID, '"abc"')
  })

  it('404s when there is no picture', async () => {
    mockGetUserAvatar.mockResolvedValue(null)
    expect((await get(`/users/${USER_ID}/avatar`, 'viewer')).statusCode).toBe(404)
  })

  it('refuses to relay anything but the three image types', async () => {
    mockGetUserAvatar.mockResolvedValue({ status: 200, bytes: Buffer.from('<svg/>'), contentType: 'image/svg+xml', etag: null })
    expect((await get(`/users/${USER_ID}/avatar`, 'viewer')).statusCode).toBe(502)
  })

  it('answers an upstream failure with an empty 502, not an error page', async () => {
    mockGetUserAvatar.mockRejectedValue(new Error('connect ECONNREFUSED'))
    const res = await get(`/users/${USER_ID}/avatar`, 'viewer')
    expect(res.statusCode).toBe(502)
    expect(res.body).toBe('')
  })

  it('sends a signed-out browser to the login page', async () => {
    const res = await fastify.inject({ method: 'GET', url: `/users/${USER_ID}/avatar` })
    expect(res.statusCode).toBe(302)
    expect(res.headers['location']).toBe('/login')
    expect(mockGetUserAvatar).not.toHaveBeenCalled()
  })
})
