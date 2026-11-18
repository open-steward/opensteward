import { describe, it, expect, afterEach } from 'vitest'
import {
  resolvePublicBaseUrl,
  resolvePublicBaseUrlOrNull,
} from '../../src/control-plane/public-base-url'

const req = { protocol: 'https', hostname: 'req.example.com' }

describe('resolvePublicBaseUrl precedence', () => {
  afterEach(() => {
    delete process.env['PUBLIC_BASE_URL']
  })

  it('falls back to the request protocol+host with no inputs', () => {
    expect(resolvePublicBaseUrl(req)).toBe('https://req.example.com')
  })

  it('PUBLIC_BASE_URL env wins over everything', () => {
    process.env['PUBLIC_BASE_URL'] = 'https://canonical.example.com/'
    expect(
      resolvePublicBaseUrl(req, {
        tenantBaseUrl: 'dept-a.acme.com',
        companyBaseUrl: 'https://company.example.com',
      }),
    ).toBe('https://canonical.example.com')
  })

  it('tenant domain wins over companyInfo and request when no env override', () => {
    expect(
      resolvePublicBaseUrl(req, {
        tenantBaseUrl: 'dept-a.acme.com',
        companyBaseUrl: 'https://company.example.com',
      }),
    ).toBe('https://dept-a.acme.com')
  })

  it('schemes a bare tenant hostname (https in production-like https request)', () => {
    expect(resolvePublicBaseUrl(req, { tenantBaseUrl: 'dept-a.acme.com' })).toBe(
      'https://dept-a.acme.com',
    )
  })

  it('uses http for a tenant hostname when the request itself is http (loopback/dev)', () => {
    expect(
      resolvePublicBaseUrl({ protocol: 'http', hostname: 'localhost' }, {
        tenantBaseUrl: 'dept-a.localhost',
      }),
    ).toBe('http://dept-a.localhost')
  })

  it('accepts a full URL tenant domain as-is (trailing slash trimmed)', () => {
    expect(resolvePublicBaseUrl(req, { tenantBaseUrl: 'https://dept-a.acme.com/' })).toBe(
      'https://dept-a.acme.com',
    )
  })

  it('companyInfo wins over request when there is no env or tenant domain', () => {
    expect(resolvePublicBaseUrl(req, { companyBaseUrl: 'https://company.example.com' })).toBe(
      'https://company.example.com',
    )
  })

  it('ignores blank tenant domain and falls through to companyInfo', () => {
    expect(
      resolvePublicBaseUrl(req, { tenantBaseUrl: '   ', companyBaseUrl: 'https://company.example.com' }),
    ).toBe('https://company.example.com')
  })
})

/**
 * A Connect Link is pasted into an email and opened by a customer's browser.
 * When the admin creates one, the request reaching integration-server comes
 * from admin-api over the docker network, so `request.hostname` is
 * `integration-server` — a name that resolves nowhere outside the compose
 * network. With PUBLIC_BASE_URL and companyInfo.baseUrl both unset, falling
 * back to the request host would emit that internal name as the customer's
 * link.
 *
 * A single-label hostname is the tell: real deployments are reached through a
 * dotted name, an IP, or localhost. Rather than emit an address that cannot
 * work, resolution reports itself unresolved so the caller can say so.
 */
describe('resolvePublicBaseUrlOrNull — non-addressable request hosts', () => {
  afterEach(() => {
    delete process.env['PUBLIC_BASE_URL']
  })

  const internal = { protocol: 'http', hostname: 'integration-server' }

  it('refuses a docker service name as a customer-facing base', () => {
    expect(resolvePublicBaseUrlOrNull(internal)).toBeNull()
  })

  it('refuses it with a port attached, as the Host header carries one', () => {
    expect(resolvePublicBaseUrlOrNull({ protocol: 'http', hostname: 'integration-server:3010' }))
      .toBeNull()
  })

  it('accepts localhost, which an operator really does browse', () => {
    expect(resolvePublicBaseUrlOrNull({ protocol: 'http', hostname: 'localhost:3010' }))
      .toBe('http://localhost:3010')
  })

  it('accepts a loopback IP', () => {
    expect(resolvePublicBaseUrlOrNull({ protocol: 'http', hostname: '127.0.0.1:3010' }))
      .toBe('http://127.0.0.1:3010')
  })

  it('accepts any dotted host', () => {
    expect(resolvePublicBaseUrlOrNull({ protocol: 'https', hostname: 'connect.acme.example' }))
      .toBe('https://connect.acme.example')
  })

  it('uses the env override even when the request arrived internally', () => {
    process.env['PUBLIC_BASE_URL'] = 'https://connect.acme.example'
    expect(resolvePublicBaseUrlOrNull(internal)).toBe('https://connect.acme.example')
  })

  it('uses companyInfo.baseUrl even when the request arrived internally', () => {
    expect(resolvePublicBaseUrlOrNull(internal, { companyBaseUrl: 'https://acme.example' }))
      .toBe('https://acme.example')
  })

  it('uses a tenant domain even when the request arrived internally', () => {
    expect(resolvePublicBaseUrlOrNull(internal, { tenantBaseUrl: 'dept-a.acme.example' }))
      .toBe('https://dept-a.acme.example')
  })

  it('leaves resolvePublicBaseUrl itself unchanged for internal callers', () => {
    // OAuth redirect_uri and other server-side URLs still want a best-effort
    // string; only customer-facing links opt into the stricter check.
    expect(resolvePublicBaseUrl(internal)).toBe('http://integration-server')
  })
})

/**
 * Fastify 5 splits the Host header: `hostname` drops the port, `host` keeps
 * it. Resolution read `hostname`, so a deployment reached on a non-default
 * port emitted URLs pointing at :80 — `http://localhost/connect/…` instead of
 * `http://localhost:3010/connect/…`. The same fallback builds OAuth
 * `redirect_uri`, so the mismatch reached providers too.
 */
describe('resolvePublicBaseUrl — port preservation', () => {
  afterEach(() => {
    delete process.env['PUBLIC_BASE_URL']
  })

  it('keeps the port from the Host header', () => {
    expect(resolvePublicBaseUrl({ protocol: 'http', hostname: 'localhost', host: 'localhost:3010' }))
      .toBe('http://localhost:3010')
  })

  it('omits nothing when the request carries no port', () => {
    expect(
      resolvePublicBaseUrl({
        protocol: 'https',
        hostname: 'connect.acme.example',
        host: 'connect.acme.example',
      }),
    ).toBe('https://connect.acme.example')
  })

  it('falls back to hostname when host is absent', () => {
    expect(resolvePublicBaseUrl({ protocol: 'https', hostname: 'req.example.com' }))
      .toBe('https://req.example.com')
  })
})
