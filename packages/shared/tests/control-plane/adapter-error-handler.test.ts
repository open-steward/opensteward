/**
 * `/v1/*` had no error-mapping layer at all — the only `setErrorHandler` in the
 * service was scoped to the sandbox mount. Anything a router did not catch went
 * to Fastify's default handler, which forwards `err.statusCode || err.status`,
 * and axios sets `.status` from the UPSTREAM response. The platform's own reply
 * therefore became OpenSteward's reply.
 *
 * An MCP sweep showed both halves of that:
 *
 *   list_purchase_orders → 400   Fortnox rejected the request; the client is
 *                                told IT sent something wrong, and goes hunting
 *                                for a bug in its own code
 *   get_organization     → 500   an error carrying no status at all, so the
 *                                same missing layer produced the opposite
 *                                extreme
 *
 * Both are the same defect. A caller cannot act on either, and cannot tell an
 * upstream outage from its own mistake.
 *
 * The taxonomy this pins:
 *   502 — the platform errored; carries the upstream status so it is diagnosable
 *   400 — the caller's request was genuinely malformed (Fastify validation)
 *   501 — only ever our own "this platform cannot do this": the routers'
 *         unmapped-method guard, or an adapter that refuses before sending
 *         anything (code NOT_SUPPORTED); never an upstream answer
 *   500 — a genuine internal fault, and nothing else
 */
import { describe, it, expect } from 'vitest'
import Fastify from 'fastify'
import { attachAdapterErrorHandler } from '../../src/control-plane/adapter-error-handler'

/** An axios-shaped rejection, as `withRetry` rethrows for any non-429. */
function upstreamError(status: number, data: unknown): Error {
  return Object.assign(new Error(`Request failed with status code ${status}`), {
    isAxiosError: true,
    status,
    config: { url: 'https://api.fortnox.se/3/purchaseorders' },
    response: { status, data },
  })
}

async function appThrowing(err: unknown) {
  const app = Fastify({ logger: false })
  attachAdapterErrorHandler(app)
  app.get('/x', async () => {
    throw err
  })
  await app.ready()
  return app
}

describe('an upstream platform error is not the caller’s fault', () => {
  it('maps a Fortnox 400 to 502 rather than passing it through', async () => {
    const app = await appThrowing(upstreamError(400, { message: 'Ogiltig begäran' }))
    const res = await app.inject({ method: 'GET', url: '/x' })
    const body = JSON.parse(res.payload)

    expect(res.statusCode).toBe(502)
    expect(body.error.code).toBe('UPSTREAM_ERROR')
    await app.close()
  })

  it('reports the upstream status so the failure stays diagnosable', async () => {
    const app = await appThrowing(upstreamError(400, { message: 'Ogiltig begäran' }))
    const body = JSON.parse((await app.inject({ method: 'GET', url: '/x' })).payload)

    expect(body.error.upstreamStatus).toBe(400)
    await app.close()
  })

  it('includes an excerpt of the upstream body, so no server-log access is needed', async () => {
    const app = await appThrowing(upstreamError(400, { message: 'Ogiltig begäran' }))
    const body = JSON.parse((await app.inject({ method: 'GET', url: '/x' })).payload)

    expect(body.error.upstreamBody).toContain('Ogiltig')
    await app.close()
  })

  it('maps an upstream 5xx to 502 as well — still not the caller’s fault', async () => {
    const app = await appThrowing(upstreamError(503, { message: 'maintenance' }))
    const res = await app.inject({ method: 'GET', url: '/x' })

    expect(res.statusCode).toBe(502)
    expect(JSON.parse(res.payload).error.upstreamStatus).toBe(503)
    await app.close()
  })

  it('maps an unreachable platform distinctly from one that answered', async () => {
    const netErr = Object.assign(new Error('ECONNREFUSED'), {
      isAxiosError: true,
      config: { url: 'https://api.fortnox.se/3/companyinformation' },
      // no `response` — the request never got one
    })
    const app = await appThrowing(netErr)
    const res = await app.inject({ method: 'GET', url: '/x' })

    expect(res.statusCode).toBe(502)
    expect(JSON.parse(res.payload).error.code).toBe('UPSTREAM_UNREACHABLE')
    await app.close()
  })
})

describe('redaction — an error body must not become a credential leak', () => {
  it('redacts a bearer token echoed back by the platform', async () => {
    const app = await appThrowing(
      upstreamError(401, { error: 'bad token', authorization: 'Bearer sk-live-abcdef123456' }),
    )
    const body = JSON.parse((await app.inject({ method: 'GET', url: '/x' })).payload)

    expect(body.error.upstreamBody).not.toContain('sk-live-abcdef123456')
    expect(body.error.upstreamBody).toContain('[redacted]')
    await app.close()
  })

  it('truncates a large upstream body rather than relaying it whole', async () => {
    const app = await appThrowing(upstreamError(400, { message: 'x'.repeat(5000) }))
    const body = JSON.parse((await app.inject({ method: 'GET', url: '/x' })).payload)

    expect(body.error.upstreamBody.length).toBeLessThan(600)
    await app.close()
  })
})

describe('everything that is not an upstream error keeps its meaning', () => {
  it('passes an adapter refusal through as 501 NOT_SUPPORTED, with its reason', async () => {
    const app = await appThrowing(
      Object.assign(new Error('Paysafe cannot list customers: a lookup of one profile'), {
        statusCode: 501,
        code: 'NOT_SUPPORTED',
      }),
    )
    const res = await app.inject({ method: 'GET', url: '/x' })
    expect(res.statusCode).toBe(501)
    expect(JSON.parse(res.payload)).toEqual({
      error: {
        code: 'NOT_SUPPORTED',
        message: 'Paysafe cannot list customers: a lookup of one profile',
      },
    })
    await app.close()
  })

  it('never maps an upstream 501 to a 501 of ours', async () => {
    const app = await appThrowing(upstreamError(501, { message: 'Not Implemented' }))
    const res = await app.inject({ method: 'GET', url: '/x' })
    expect(res.statusCode).toBe(502)
    expect(JSON.parse(res.payload).error.code).toBe('UPSTREAM_ERROR')
    await app.close()
  })

  it('leaves a deliberate 4xx from our own code alone', async () => {
    const app = await appThrowing(
      Object.assign(new Error('nope'), { statusCode: 404, code: 'RESOURCE_NOT_FOUND' }),
    )
    const res = await app.inject({ method: 'GET', url: '/x' })

    expect(res.statusCode).toBe(404)
    await app.close()
  })

  it('reports a genuine internal fault as 500 without leaking the message', async () => {
    const app = await appThrowing(new TypeError("Cannot read properties of undefined"))
    const res = await app.inject({ method: 'GET', url: '/x' })
    const body = JSON.parse(res.payload)

    expect(res.statusCode).toBe(500)
    expect(body.error.code).toBe('INTERNAL')
    expect(JSON.stringify(body)).not.toContain('Cannot read properties')
    await app.close()
  })
})

/**
 * An axios timeout, as `axios.defaults.timeout` produces once a request
 * exceeds its budget. Note `response` is absent — the platform never answered.
 */
function timeoutError(code: 'ECONNABORTED' | 'ETIMEDOUT' = 'ECONNABORTED'): Error {
  return Object.assign(new Error('timeout of 30000ms exceeded'), {
    isAxiosError: true,
    code,
    config: { url: 'https://api.xero.com/api.xro/2.0/Accounts', timeout: 30000 },
    response: undefined,
  })
}

/**
 * Findings 7 and 21. A stalled upstream previously produced no answer at all;
 * once a timeout is installed it produces an error, and that error must say
 * "the platform did not answer in time" rather than the generic
 * "could not be reached".
 *
 * The distinction is operational, not cosmetic. UNREACHABLE says the platform
 * is down and retrying now is pointless; TIMEOUT says it accepted the
 * connection and went quiet, which is the signature of rate-limiting, a slow
 * report query, or an endpoint returning far more data than the caller wanted.
 * Those want opposite responses — back off versus narrow the query — and 504
 * rather than 502 is what tells a proxy or client which one it is.
 */
describe('a stalled upstream is reported as a timeout, not as unreachable', () => {
  it('maps an axios ECONNABORTED to 504 UPSTREAM_TIMEOUT', async () => {
    const app = await appThrowing(timeoutError('ECONNABORTED'))
    const res = await app.inject({ method: 'GET', url: '/x' })
    const body = JSON.parse(res.payload)

    expect(res.statusCode).toBe(504)
    expect(body.error.code).toBe('UPSTREAM_TIMEOUT')
    await app.close()
  })

  it('maps ETIMEDOUT the same way', async () => {
    const app = await appThrowing(timeoutError('ETIMEDOUT'))
    const res = await app.inject({ method: 'GET', url: '/x' })
    expect(res.statusCode).toBe(504)
    expect(JSON.parse(res.payload).error.code).toBe('UPSTREAM_TIMEOUT')
    await app.close()
  })

  it('attributes the fault to the platform, not to the caller', async () => {
    const app = await appThrowing(timeoutError())
    const body = JSON.parse((await app.inject({ method: 'GET', url: '/x' })).payload)
    expect(body.error.message).toMatch(/not a problem with your request/i)
    await app.close()
  })

  it('still reports a genuinely unreachable platform as UNREACHABLE', async () => {
    // Connection refused carries no timeout code; it must not be relabelled.
    const refused = Object.assign(new Error('connect ECONNREFUSED'), {
      isAxiosError: true,
      code: 'ECONNREFUSED',
      config: { url: 'https://api.xero.com/' },
      response: undefined,
    })
    const app = await appThrowing(refused)
    const res = await app.inject({ method: 'GET', url: '/x' })
    expect(res.statusCode).toBe(502)
    expect(JSON.parse(res.payload).error.code).toBe('UPSTREAM_UNREACHABLE')
    await app.close()
  })
})
