import { describe, it, expect } from 'vitest'
import {
  validateCountry,
  resolveSlugs,
  setupTaken,
  isYes,
  runSetup,
  type WizardIO,
  type WizardHttp,
  type WizardDeps,
} from '../src/setup'
import type { Credentials } from '../src/auth'

// ── Pure helpers ────────────────────────────────────────────────────

describe('validateCountry', () => {
  it('accepts and upper-cases a known ISO alpha-2 code', () => {
    expect(validateCountry('se')).toBe('SE')
    expect(validateCountry('  US ')).toBe('US')
  })
  it('rejects unknown codes and blanks', () => {
    expect(validateCountry('ZZ')).toBeNull()
    expect(validateCountry('Sweden')).toBeNull()
    expect(validateCountry('')).toBeNull()
  })
})

describe('resolveSlugs', () => {
  const known = ['fortnox', 'xero', 'quickbooks']
  it('resolves known slugs case-insensitively, dedupes, preserves order', () => {
    expect(resolveSlugs('Xero, fortnox xero', known)).toEqual({
      toEnable: ['xero', 'fortnox'],
      unknown: [],
    })
  })
  it('separates unknown slugs', () => {
    expect(resolveSlugs('fortnox, bogus', known)).toEqual({
      toEnable: ['fortnox'],
      unknown: ['bogus'],
    })
  })
  it('returns empty for blank input', () => {
    expect(resolveSlugs('  ', known)).toEqual({ toEnable: [], unknown: [] })
  })
})

describe('setupTaken / isYes', () => {
  it('setupTaken is true only for 409', () => {
    expect(setupTaken(409)).toBe(true)
    expect(setupTaken(201)).toBe(false)
    expect(setupTaken(400)).toBe(false)
  })
  it('isYes parses affirmatives and honours the default on blank', () => {
    expect(isYes('y')).toBe(true)
    expect(isYes('YES')).toBe(true)
    expect(isYes('n')).toBe(false)
    expect(isYes('', true)).toBe(true)
    expect(isYes('')).toBe(false)
  })
})

// ── Flow ────────────────────────────────────────────────────────────

/** Scripted IO: answers consumed in order; printed lines captured. */
function scriptedIO(answers: string[]): { io: WizardIO; out: string[] } {
  let i = 0
  const out: string[] = []
  const io: WizardIO = {
    ask: async () => answers[i++] ?? '',
    askHidden: async () => answers[i++] ?? '',
    print: (l) => out.push(l),
  }
  return { io, out }
}

interface Call {
  method: string
  path: string
  body?: unknown
  params?: unknown
}

/** Fake HTTP keyed by `METHOD path` → response; records every call. */
function fakeHttp(
  routes: Record<string, { status: number; data?: unknown; error?: unknown }>,
): { http: WizardDeps['http']; calls: Call[] } {
  const calls: Call[] = []
  const http: WizardDeps['http'] = () => {
    const h: WizardHttp = {
      async request(method, path, init) {
        calls.push({ method, path, body: init?.body, params: init?.params })
        return routes[`${method} ${path}`] ?? { status: 404, error: { error: 'no route' } }
      },
    }
    return h
  }
  return { http, calls }
}

describe('runSetup', () => {
  it('falls back setup→login on 409, persists creds, enables chosen adapter, skips unknown', async () => {
    const { io, out } = scriptedIO([
      'http://api.test', // base URL
      'admin', // username
      'pw', // password (hidden)
      'y', // configure branding?
      'Acme', // company name
      'se', // country
      'accounting', // vertical
      'fortnox, nope', // slugs
      'n', // mint API key?
    ])
    const saved: Credentials[] = []
    const { http, calls } = fakeHttp({
      'GET /version': { status: 200, data: { version: '1.0.0' } },
      'POST /api/auth/setup': { status: 409, error: { error: 'exists' } },
      'POST /api/auth/login': { status: 200, data: { token: 'jwt-123' } },
      'PUT /api/company-info': { status: 200, data: { data: { name: 'Acme' } } },
      'GET /api/verticals': { status: 200, data: { data: [{ name: 'accounting', status: 'up' }] } },
      'GET /api/verticals/{vertical}/platforms': {
        status: 200,
        data: { data: [{ slug: 'fortnox', enabled: false }, { slug: 'xero', enabled: true }] },
      },
      'POST /api/verticals/{vertical}/platforms/{slug}/enable': { status: 200, data: { ok: true } },
    })

    await runSetup({ io, http, saveCredentials: (c) => { saved.push(c); return '/tmp/creds.json' }, defaultBaseUrl: 'http://api.test' })

    // auth fell back to login and persisted the JWT
    expect(calls.some((c) => c.path === '/api/auth/setup')).toBe(true)
    expect(calls.some((c) => c.path === '/api/auth/login')).toBe(true)
    expect(saved).toHaveLength(1)
    expect(saved[0]).toMatchObject({ baseUrl: 'http://api.test', jwt: 'jwt-123', username: 'admin' })

    // branding saved with the validated upper-cased country
    const put = calls.find((c) => c.method === 'PUT' && c.path === '/api/company-info')
    expect(put?.body).toEqual({ name: 'Acme', country: 'SE' })

    // exactly one enable (fortnox); unknown 'nope' skipped; xero already enabled untouched
    const enables = calls.filter((c) => c.path === '/api/verticals/{vertical}/platforms/{slug}/enable')
    expect(enables).toHaveLength(1)
    expect((enables[0].params as { path?: { slug?: string } }).path?.slug).toBe('fortnox')
    expect(out.join('\n')).toContain("unknown adapter 'nope'")

    // API-key mint was declined → no call
    expect(calls.some((c) => c.path === '/api/api-keys')).toBe(false)
  })

  it('aborts cleanly when auth login also fails', async () => {
    const { io, out } = scriptedIO(['http://api.test', 'admin', 'badpw'])
    const { http, calls } = fakeHttp({
      'GET /version': { status: 200 },
      'POST /api/auth/setup': { status: 409, error: { error: 'exists' } },
      'POST /api/auth/login': { status: 401, error: { error: 'bad credentials' } },
    })
    let savedCount = 0
    await runSetup({ io, http, saveCredentials: () => { savedCount++; return '' }, defaultBaseUrl: 'http://api.test' })
    expect(savedCount).toBe(0)
    expect(calls.some((c) => c.path === '/api/verticals')).toBe(false)
    expect(out.join('\n')).toContain('login failed')
  })
})
