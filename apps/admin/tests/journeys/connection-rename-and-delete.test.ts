/**
 * Renaming and revoking a connection from the admin UI.
 *
 * Both actions already existed for developers — `PATCH /v1/connections/{id}`
 * and `DELETE /v1/connections/{id}` — while the operator pages could only
 * display the label a Connect Link happened to set. That gap matters most for
 * the routine case: anything connected through
 * `/auth/{vertical}/{platform}/connect` without `?label=` arrives unlabelled,
 * and the label is what the list links and what the search matches, so the
 * connection an operator most needs to name is the one they could not.
 *
 * The two actions are deliberately not symmetric, and this pins the asymmetry:
 *
 *  - A rename that fails is reported *in place*. A taken label is a 409 the
 *    operator fixes by choosing another name, and an error page would lose the
 *    connection they were looking at.
 *  - A delete that fails must NOT redirect. A tidy redirect and a banner would
 *    read as proof the credentials are gone when they are not — the invariant
 *    `upstream-failure-is-not-emptiness` holds for every destructive action.
 */
import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flashOf, flashCookieOf } from '../helpers/flash'
import { createHmac } from 'crypto'

const mockListConnectionsPaged = vi.fn()
const mockGetConnection = vi.fn()
const mockUpdateConnectionLabel = vi.fn()
const mockDeleteConnection = vi.fn()

vi.mock('../../src/core/proxy/admin-api-client', async () => {
  const { adminApiStub } = await import('../helpers/admin-api-stub')
  return {
    AdminApiClient: adminApiStub({
      listConnectionsPaged: mockListConnectionsPaged,
      getConnection: mockGetConnection,
      updateConnectionLabel: mockUpdateConnectionLabel,
      deleteConnection: mockDeleteConnection,
      getLoginOptions: async () => ({ providers: [], localLoginEnabled: true }),
      getCompanyInfo: async () => null,
    }),
  }
})

const { buildServer } = await import('../../src/core/server')

const SESSION_SECRET = 'connection-rename-session-secret-long-enough'
const CONN = {
  id: '9f8e7d6c-1111-4a2b-8c3d-000000000001',
  vertical: 'accounting',
  platform: 'fortnox',
  label: 'Acme Books',
  status: 'valid',
  createdAt: '2026-01-15T09:30:00.000Z',
  updatedAt: '2026-02-01T10:00:00.000Z',
}
const DETAIL = `/connections/accounting/${CONN.id}`

let fastify: FastifyInstance

function cookie(role = 'admin') {
  return fastify.signCookie(JSON.stringify({ id: 'u1', username: 'admin', role, token: 'jwt' }))
}
function csrf(c: string) {
  return createHmac('sha256', SESSION_SECRET).update(c).digest('hex').slice(0, 32)
}

beforeEach(async () => {
  mockUpdateConnectionLabel.mockReset().mockResolvedValue(CONN)
  mockDeleteConnection.mockReset().mockResolvedValue(undefined)
  mockGetConnection.mockReset().mockResolvedValue(CONN)
  mockListConnectionsPaged.mockReset().mockResolvedValue({
    data: [CONN],
    meta: { page: 1, limit: 50, total: 1 },
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

function get(url: string, role = 'admin') {
  return fastify.inject({ method: 'GET', url, cookies: { session: cookie(role) } })
}
function post(path: string, role = 'admin', body: Record<string, string> = {}) {
  const c = cookie(role)
  return fastify.inject({
    method: 'POST',
    url: path,
    cookies: { session: c },
    payload: { _csrf: csrf(c), ...body },
  })
}
const rename = (role = 'admin', label = 'Renamed') =>
  post(`${DETAIL}/rename`, role, { label })
const remove = (role = 'admin') => post(`${DETAIL}/delete`, role)

describe('Journey: naming a connection', () => {
  it('offers the label as an editable field, prefilled with what it is called now', async () => {
    const res = await get(DETAIL)
    expect(res.body).toContain(`action="${DETAIL}/rename"`)
    expect(res.body).toMatch(/name="label"[^>]*value="Acme Books"/)
  })

  it('invites a name on a connection that arrived without one', async () => {
    mockGetConnection.mockResolvedValue({ ...CONN, label: null })
    const res = await get(DETAIL)
    expect(res.body).toMatch(/name="label"[^>]*value=""/)
    expect(res.body).toContain('placeholder="Unlabelled"')
  })

  it('saves the new name for the connection being viewed', async () => {
    const res = await rename('admin', 'Acme production books')
    expect(mockUpdateConnectionLabel).toHaveBeenCalledWith(
      'jwt',
      'accounting',
      CONN.id,
      'Acme production books',
    )
    expect(res.headers.location).toBe(DETAIL)
  })

  it('treats an emptied box as clearing the label, not as a name made of spaces', async () => {
    await rename('admin', '   ')
    expect(mockUpdateConnectionLabel).toHaveBeenCalledWith('jwt', 'accounting', CONN.id, null)
  })

  it('says the label was cleared rather than that it was renamed to nothing', async () => {
    const res = await rename('admin', '')
    expect(flashOf(fastify, res)[0]).toMatchObject({ tone: 'success', body: 'Label cleared.' })
  })

  it('does not echo the new name into the flash cookie', async () => {
    // A label is unbounded caller input and the toast body is a cookie; the
    // page being returned to already shows the result.
    const res = await rename('admin', 'x'.repeat(400))
    expect(flashOf(fastify, res)[0]!.body).not.toContain('xxxx')
  })

  it('reports a taken name in place, keeping the operator on the connection', async () => {
    mockUpdateConnectionLabel.mockRejectedValue(
      Object.assign(new Error('Request failed with status code 409'), {
        response: {
          status: 409,
          data: {
            error: {
              code: 'DUPLICATE_LABEL',
              message: "Connection label 'Acme Books' already exists on platform 'fortnox'",
            },
          },
        },
      }),
    )
    const res = await rename()
    const [message] = flashOf(fastify, res)
    expect(message.tone).toBe('danger')
    expect(message.body).toContain('already exists')
    expect(res.headers.location).toBe(DETAIL)
  })

  it('shows the outcome once, on the page it returns to', async () => {
    const saved = await rename()
    const page = await fastify.inject({
      method: 'GET',
      url: DETAIL,
      cookies: { session: cookie('admin'), os_flash: flashCookieOf(saved)! },
    })
    expect(page.body).toContain('Connection renamed.')
  })

  it('shows a viewer the label without a way to change it', async () => {
    const res = await get(DETAIL, 'viewer')
    expect(res.body).toContain('Acme Books')
    expect(res.body).not.toContain(`action="${DETAIL}/rename"`)
  })

  it('refuses the rename from a viewer even if they craft the POST', async () => {
    const res = await rename('viewer')
    expect(mockUpdateConnectionLabel).not.toHaveBeenCalled()
    expect(res.statusCode).not.toBe(302)
  })
})

describe('Journey: revoking a connection', () => {
  it('offers the action on the connection it would delete', async () => {
    const res = await get(DETAIL)
    expect(res.body).toContain(`action="${DETAIL}/delete"`)
    expect(res.body).toContain('Delete connection')
  })

  it('says what goes with it before asking, since nothing here is recoverable', async () => {
    const res = await get(DETAIL)
    expect(res.body).toContain('onsubmit="return confirm(')
    expect(res.body).toContain('cannot be undone')
    // The cascade is the part an operator would not otherwise expect.
    expect(res.body).toContain('cached data')
  })

  it('deletes the connection and returns to the list', async () => {
    const res = await remove()
    expect(mockDeleteConnection).toHaveBeenCalledWith('jwt', 'accounting', CONN.id)
    expect(res.headers.location).toBe('/connections')
    expect(flashOf(fastify, res)[0]).toMatchObject({ tone: 'success' })
  })

  it('does not report a deletion that failed as done', async () => {
    mockDeleteConnection.mockRejectedValue(
      Object.assign(new Error('Request failed with status code 500'), {
        response: { status: 500, data: { error: 'boom' } },
      }),
    )
    const res = await remove()
    expect(res.statusCode).not.toBe(302)
    expect(flashOf(fastify, res).some((f) => f.tone === 'success')).toBe(false)
  })

  it('hides the action from a viewer, who cannot revoke', async () => {
    const res = await get(DETAIL, 'viewer')
    expect(res.body).not.toContain('Delete connection')
  })

  it('refuses the delete from a viewer even if they craft the POST', async () => {
    const res = await remove('viewer')
    expect(mockDeleteConnection).not.toHaveBeenCalled()
    expect(res.statusCode).not.toBe(302)
  })
})
