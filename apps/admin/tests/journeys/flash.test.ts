/**
 * Journey: the admin reports an action's outcome exactly once.
 *
 * An outcome is an event, not a property of an address: a message carried in
 * the URL (`?saved=1`) replays on Back, Forward, a refresh or a shared link —
 * "Saved." for something that has not just happened.
 *
 * The load-bearing test here is `does not replay on a second visit`.
 */
import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/core/proxy/admin-api-client', async () => {
  // `await import`: vi.mock is hoisted above this file's imports, but the
  // factory body runs later, so it can import what the top level cannot.
  const { adminApiStub } = await import('../helpers/admin-api-stub')
  return {
    AdminApiClient: adminApiStub({
      getLoginOptions: async () => {
        return { providers: [], localLoginEnabled: true }
      },
      hasUsers: async () => {
        return true
      },
      getCompanyInfo: async () => {
        return null
      },
      listConnections: async () => {
        return []
      },
      listTenants: async () => {
        return []
      },
      listTenantDomains: async () => {
        return []
      },
    }),
  }
})

const { buildServer } = await import('../../src/core/server')
const { setFlash, flashSuccess, flashError, FLASH_COOKIE } = await import('../../src/core/flash')
const { flashOf, flashCookieOf, withFlash } = await import('../helpers/flash')

const SESSION_SECRET = 'admin-flash-secret-long-enough-for-hmac'
let fastify: FastifyInstance

function session() {
  return fastify.signCookie(
    JSON.stringify({ id: 'u1', username: 'admin', role: 'admin', token: 'jwt' }),
  )
}

beforeEach(async () => {
  const built = await buildServer({
    server: { port: 0, host: '127.0.0.1' },
    session: { secret: SESSION_SECRET },
    admin_api: { url: 'http://localhost:3001' },
    docs_server: { url: 'http://localhost:3003' },
    sso: { publicBaseUrl: 'http://localhost:3000' },
  })
  fastify = built.fastify

  // Routes that exercise the mechanism directly, so these tests do not depend
  // on which real route happens to flash today.
  fastify.get('/t/queue-success', async (_req, reply) => {
    flashSuccess(reply, 'Tenant created.')
    return reply.redirect('/t/render')
  })
  fastify.get('/t/queue-error', async (_req, reply) => {
    flashError(reply, 'Upstream refused.')
    return reply.redirect('/t/render')
  })
  fastify.get('/t/queue-two', async (_req, reply) => {
    flashSuccess(reply, 'First.')
    setFlash(reply, { tone: 'info', body: 'Second.' })
    return reply.redirect('/t/render')
  })
  fastify.get('/t/queue-long', async (_req, reply) => {
    flashError(reply, 'x'.repeat(2000))
    return reply.redirect('/t/render')
  })
  fastify.get('/t/render', async (_req, reply) => reply.view('login.ejs', { error: null }))
  fastify.get('/t/hop', async (_req, reply) => reply.redirect('/t/render'))
  fastify.get('/t/json', async (_req, reply) => reply.send({ ok: true }))
  fastify.get('/t/csv', async (_req, reply) =>
    reply.header('content-type', 'text/csv').send('a,b\n1,2\n'),
  )

  await fastify.ready()
})

afterEach(async () => {
  await fastify?.close()
  vi.clearAllMocks()
})

const get = (url: string, cookies: Record<string, string> = {}) =>
  fastify.inject({ method: 'GET', url, cookies: { session: session(), ...cookies } })

describe('Journey: an action reports its outcome exactly once', () => {
  it('queues a message on the redirect rather than in the URL', async () => {
    const res = await get('/t/queue-success')
    expect(res.headers.location).toBe('/t/render')
    // The whole point: nothing about the message is in the address.
    expect(res.headers.location).not.toContain('?')
    expect(flashOf(fastify, res)).toEqual([{ tone: 'success', body: 'Tenant created.' }])
  })

  it('renders the queued message on the next page', async () => {
    const queued = await get('/t/queue-success')
    const page = await get('/t/render', { [FLASH_COOKIE]: flashCookieOf(queued)! })

    expect(page.body).toContain('flash-data')
    expect(page.body).toContain('Tenant created.')
    expect(page.body).toContain('data-flash-tone="success"')
  })

  it('does not replay on a second visit to the same URL', async () => {
    // Back/Forward: same address, no cookie, nothing to say — the property
    // that makes outcomes events.
    const page = await get('/t/render')
    expect(page.body).not.toContain('flash-data')
    expect(page.body).not.toContain('Tenant created.')
  })

  it('clears the cookie and forbids caching once displayed', async () => {
    const queued = await get('/t/queue-success')
    const page = await get('/t/render', { [FLASH_COOKIE]: flashCookieOf(queued)! })

    expect(flashCookieOf(page)).toBeNull()
    // Without no-store the replay bug just moves into the HTTP cache, where
    // `inject` cannot see it but a real browser can.
    expect(page.headers['cache-control']).toBe('no-store')
  })

  it('survives an intermediate redirect', async () => {
    const queued = await get('/t/queue-success')
    const hop = await get('/t/hop', { [FLASH_COOKIE]: flashCookieOf(queued)! })

    // A 302 is not a rendered page, so it must not consume the message.
    expect(flashCookieOf(hop)).toBeNull()
    const page = await get('/t/render', { [FLASH_COOKIE]: flashCookieOf(queued)! })
    expect(page.body).toContain('Tenant created.')
  })

  it('is not consumed by a JSON response', async () => {
    // The layout fetches /api/version-info on every page; if that could eat the
    // flash it would race the document and the message would vanish at random.
    const queued = await get('/t/queue-success')
    const json = await get('/t/json', { [FLASH_COOKIE]: flashCookieOf(queued)! })
    expect(flashCookieOf(json)).toBeNull()
    expect(json.headers['cache-control']).not.toBe('no-store')

    const page = await get('/t/render', { [FLASH_COOKIE]: flashCookieOf(queued)! })
    expect(page.body).toContain('Tenant created.')
  })

  it('is not consumed by a file download', async () => {
    const queued = await get('/t/queue-success')
    const csv = await get('/t/csv', { [FLASH_COOKIE]: flashCookieOf(queued)! })
    expect(flashCookieOf(csv)).toBeNull()

    const page = await get('/t/render', { [FLASH_COOKIE]: flashCookieOf(queued)! })
    expect(page.body).toContain('Tenant created.')
  })

  it('renders two messages in order', async () => {
    const queued = await get('/t/queue-two')
    expect(flashOf(fastify, queued)).toEqual([
      { tone: 'success', body: 'First.' },
      { tone: 'info', body: 'Second.' },
    ])

    const page = await get('/t/render', { [FLASH_COOKIE]: flashCookieOf(queued)! })
    expect(page.body.indexOf('First.')).toBeLessThan(page.body.indexOf('Second.'))
  })

  it('marks errors so the client can keep them on screen', async () => {
    const queued = await get('/t/queue-error')
    expect(flashOf(fastify, queued)[0].tone).toBe('danger')

    const page = await get('/t/render', { [FLASH_COOKIE]: flashCookieOf(queued)! })
    // flash.js turns `danger` into duration 0. Asserting the tone at the
    // boundary keeps "errors do not vanish" a property of the payload rather
    // than of any one call site.
    expect(page.body).toContain('data-flash-tone="danger"')
  })

  it('truncates an over-long message rather than letting the browser drop it', async () => {
    const res = await get('/t/queue-long')
    const [message] = flashOf(fastify, res)

    expect(message.body.length).toBeLessThanOrEqual(512)
    expect(message.body.endsWith('…')).toBe(true)
    // A dropped cookie means NO feedback at all, which is worse than a clipped
    // sentence.
    expect(flashCookieOf(res)!.length).toBeLessThan(4096)
  })

  it('ignores a tampered cookie without erroring', async () => {
    const page = await get('/t/render', { [FLASH_COOKIE]: 'not-a-valid-signed-value' })
    expect(page.statusCode).toBe(200)
    expect(page.body).not.toContain('flash-data')
  })

  it('ignores a validly signed payload carrying an unknown tone', async () => {
    // The tone becomes a CSS class and decides stickiness, so it is validated
    // against the union rather than trusted.
    const forged = withFlash(fastify, [{ tone: 'evil' as never, body: 'nope' }])
    const page = await get('/t/render', { [FLASH_COOKIE]: forged })
    expect(page.body).not.toContain('nope')
  })

  it('escapes a message that tries to break out of the page', async () => {
    const nasty = withFlash(fastify, [
      { tone: 'danger', body: '</script><img src=x onerror=alert(1)>' },
    ])
    const page = await get('/t/render', { [FLASH_COOKIE]: nasty })

    expect(page.body).not.toContain('<img src=x onerror=alert(1)>')
    expect(page.body).toContain('&lt;/script&gt;')
  })
})
