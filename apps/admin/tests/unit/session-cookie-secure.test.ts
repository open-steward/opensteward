import { describe, it, expect, afterEach, vi } from 'vitest'

/**
 * `SESSION_COOKIE_SECURE` decides whether the session and flash cookies carry
 * `Secure`.
 *
 * The default must stay `NODE_ENV === 'production'`: a stock OpenSteward is
 * secure without anyone configuring it, and the override exists only for
 * serving over plain HTTP to a non-localhost address, where a browser refuses
 * to store a `Secure` cookie at all and login fails silently.
 *
 * `cookieSecure()` reads the environment when called, so each case re-imports
 * the module with the env already stubbed.
 */
async function secureWith(env: Record<string, string | undefined>): Promise<boolean> {
  vi.resetModules()
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) vi.stubEnv(k, '')
    else vi.stubEnv(k, v)
  }
  const mod = await import('../../src/core/auth/session-cookie')
  return mod.cookieSecure()
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('cookieSecure default', () => {
  it('is on in production when unset', async () => {
    expect(await secureWith({ NODE_ENV: 'production', SESSION_COOKIE_SECURE: undefined })).toBe(true)
  })

  it('is off outside production when unset', async () => {
    expect(await secureWith({ NODE_ENV: 'development', SESSION_COOKIE_SECURE: undefined })).toBe(
      false,
    )
  })
})

describe('cookieSecure override', () => {
  it('can be turned off explicitly in production', async () => {
    // The whole point: a production build served over plain HTTP on a LAN.
    expect(await secureWith({ NODE_ENV: 'production', SESSION_COOKIE_SECURE: 'false' })).toBe(false)
  })

  it('can be turned on explicitly outside production', async () => {
    expect(await secureWith({ NODE_ENV: 'development', SESSION_COOKIE_SECURE: 'true' })).toBe(true)
  })

  it.each(['false', 'FALSE', '0', 'no', ' false '])('reads %j as off', async (v) => {
    expect(await secureWith({ NODE_ENV: 'production', SESSION_COOKIE_SECURE: v })).toBe(false)
  })

  it.each(['true', 'TRUE', '1', 'yes'])('reads %j as on', async (v) => {
    expect(await secureWith({ NODE_ENV: 'development', SESSION_COOKIE_SECURE: v })).toBe(true)
  })

  it('falls back to the default on an unrecognised value rather than reading it as off', async () => {
    // A typo must not quietly downgrade a production deployment.
    expect(await secureWith({ NODE_ENV: 'production', SESSION_COOKIE_SECURE: 'flase' })).toBe(true)
    expect(await secureWith({ NODE_ENV: 'production', SESSION_COOKIE_SECURE: 'off' })).toBe(true)
  })
})

describe('the two cookies agree', () => {
  it('applies the same setting to the session cookie attributes', async () => {
    vi.resetModules()
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('SESSION_COOKIE_SECURE', 'false')
    const { SESSION_COOKIE_ATTRIBUTES, cookieSecure } = await import(
      '../../src/core/auth/session-cookie'
    )
    // A deployment that can store the session cookie but not the flash cookie
    // keeps working while losing every error banner, so these must not drift.
    expect(SESSION_COOKIE_ATTRIBUTES.secure).toBe(cookieSecure())
    expect(SESSION_COOKIE_ATTRIBUTES.secure).toBe(false)
  })
})
