/**
 * Resetting company info to the defaults OpenSteward ships with.
 *
 * Two stages, both pinned here: a danger button on /company-info, then the
 * browser's own confirm (`data-confirm`, handled by shell.js under the strict
 * CSP). Only once both are through does admin-api delete the record.
 *
 * The reset is destructive and admin-only, so it follows the rule every
 * destructive action here keeps: a reset that failed must not answer with a
 * redirect and a success toast, which would read as proof the branding is gone.
 */
import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flashCookieOf, flashOf } from '../helpers/flash'
import { createHmac } from 'crypto'

const mockGetCompanyInfo = vi.fn()
const mockResetCompanyInfo = vi.fn()

vi.mock('../../src/core/proxy/admin-api-client', async () => {
  const { adminApiStub } = await import('../helpers/admin-api-stub')
  return {
    AdminApiClient: adminApiStub({
      getCompanyInfo: mockGetCompanyInfo,
      resetCompanyInfo: mockResetCompanyInfo,
      getLoginOptions: async () => ({ providers: [], localLoginEnabled: true }),
    }),
  }
})

const { buildServer } = await import('../../src/core/server')

const SESSION_SECRET = 'company-info-reset-session-secret-long-enough'
const ACME = { name: 'Acme', primaryColor: '#2D6ADB', updatedAt: 1, updatedBy: 'u1' }

let fastify: FastifyInstance

function cookie(role = 'admin') {
  return fastify.signCookie(JSON.stringify({ id: 'u1', username: 'admin', role, token: 'jwt' }))
}
function csrf(c: string) {
  return createHmac('sha256', SESSION_SECRET).update(c).digest('hex').slice(0, 32)
}

beforeEach(async () => {
  mockGetCompanyInfo.mockReset().mockResolvedValue(ACME)
  mockResetCompanyInfo.mockReset().mockResolvedValue(undefined)
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
function reset(role = 'admin', withCsrf = true) {
  const c = cookie(role)
  return fastify.inject({
    method: 'POST',
    url: '/company-info/reset',
    cookies: { session: c },
    payload: withCsrf ? { _csrf: csrf(c) } : {},
  })
}

/** The reset form's opening tag, as rendered. */
function resetForm(body: string): string {
  const match = body.match(/<form[^>]*data-company-reset[^>]*>/)
  expect(match, 'reset form rendered').not.toBeNull()
  return match![0]
}

describe('Journey: resetting company info to the defaults', () => {
  it('offers a danger button in a form of its own, apart from Save', async () => {
    const res = await get('/company-info')
    expect(res.statusCode).toBe(200)
    expect(resetForm(res.body)).toContain('action="/company-info/reset"')
    expect(res.body).toMatch(/class="btn btn--danger[^"]*"[^>]*>Reset Company Info<\/button>/)
    // The main form still posts to the save route — the reset is not a
    // second button inside it that a stray Enter could submit.
    expect(res.body).toContain('action="/company-info" class="card')
  })

  it('asks the browser to confirm, saying what goes and that it cannot be undone', async () => {
    const tag = resetForm((await get('/company-info')).body)
    expect(tag).toMatch(/data-confirm="[^"]*OpenSteward defaults[^"]*"/)
    expect(tag).toContain('logo, favicon and font')
    expect(tag).toContain('cannot be undone')
    // CSP-safe: the confirm rides shell.js, never an inline handler.
    expect(tag).not.toContain('onsubmit')
  })

  it('resets through admin-api and returns to the page with a toast', async () => {
    const res = await reset()
    expect(mockResetCompanyInfo).toHaveBeenCalledWith('jwt')
    expect(res.statusCode).toBe(302)
    expect(res.headers.location).toBe('/company-info')
    expect(flashOf(fastify, res)[0]).toMatchObject({
      tone: 'success',
      body: 'Company info reset to the defaults.',
    })
  })

  it('renders the emptied form after the reset, with the toast shown once', async () => {
    const done = await reset()
    mockGetCompanyInfo.mockResolvedValue(null)
    const page = await fastify.inject({
      method: 'GET',
      url: '/company-info',
      cookies: { session: cookie('admin'), os_flash: flashCookieOf(done)! },
    })
    expect(page.statusCode).toBe(200)
    expect(page.body).toContain('Company info reset to the defaults.')
    expect(page.body).toMatch(/name="name"[^>]*value=""/)
  })

  it('does not report a reset that failed as done', async () => {
    mockResetCompanyInfo.mockRejectedValue(
      Object.assign(new Error('Request failed with status code 500'), {
        response: { status: 500, data: { error: 'boom' } },
      }),
    )
    const res = await reset()
    expect(res.statusCode).not.toBe(302)
    expect(flashOf(fastify, res).some((f) => f.tone === 'success')).toBe(false)
  })

  it('refuses a POST without the CSRF token', async () => {
    const res = await reset('admin', false)
    expect(mockResetCompanyInfo).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(403)
  })

  it('refuses an operator even if they craft the POST', async () => {
    const res = await reset('operator')
    expect(mockResetCompanyInfo).not.toHaveBeenCalled()
    expect(res.statusCode).not.toBe(302)
  })
})
