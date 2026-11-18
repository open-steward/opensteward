import { describe, it, expect, vi, afterEach } from 'vitest'
import { assertSecret } from '../../src/auth/secrets'

const STRONG = 'a8f3e2d4c5b6a7e8f9d0c1b2a3e4f5d6c7b8a9e0f1d2c3b4a5e6f7d8c9b0a1e2' // 64 hex chars

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('assertSecret — production mode', () => {
  it('returns the value when strong', () => {
    expect(assertSecret('JWT_SECRET', STRONG, { nodeEnv: 'production' })).toBe(STRONG)
  })

  it('throws when value is undefined', () => {
    expect(() => assertSecret('JWT_SECRET', undefined, { nodeEnv: 'production' })).toThrow(/not set/)
  })

  it('throws when value is shorter than minLength', () => {
    expect(() =>
      assertSecret('JWT_SECRET', 'short', { nodeEnv: 'production' }),
    ).toThrow(/minimum 32/)
  })

  it('throws on a denylisted placeholder', () => {
    expect(() =>
      assertSecret('JWT_SECRET', 'replace-me-with-a-random-32-char-string-or-longer', {
        nodeEnv: 'production',
      }),
    ).toThrow(/placeholder/)
  })

  it('throws on low-entropy strings', () => {
    expect(() =>
      assertSecret('JWT_SECRET', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', {
        nodeEnv: 'production',
      }),
    ).toThrow(/entropy/)
  })

  it('accepts a 64-char hex string', () => {
    expect(assertSecret('JWT_SECRET', STRONG, { nodeEnv: 'production' })).toBe(STRONG)
  })

  it('accepts a 48-char base64 string', () => {
    // openssl rand -base64 48 style — 64-char output
    const base64 = 'D7xAxMTYvDVZ8WBA7wkZf3KEpQpYxAvKMm2vEHnGl9V8XJzVtBxqRLpOSXTfgIv9'
    expect(assertSecret('JWT_SECRET', base64, { nodeEnv: 'production' })).toBe(base64)
  })

  it('accepts a plain numeric minLength argument', () => {
    expect(assertSecret('JWT_SECRET', STRONG, 32)).toBe(STRONG)
  })

  it('honours a custom minLength via options', () => {
    expect(() =>
      assertSecret('JWT_SECRET', 'a'.repeat(20), { minLength: 64, nodeEnv: 'production' }),
    ).toThrow(/minimum 64/)
  })
})

describe('assertSecret — development mode', () => {
  it('warns instead of throwing on a weak value', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const result = assertSecret('JWT_SECRET', 'short', { nodeEnv: 'development' })
    expect(result).toBe('short')
    expect(warn).toHaveBeenCalledOnce()
    expect(warn.mock.calls[0][0]).toMatch(/JWT_SECRET/)
  })

  it('still returns "" when value is undefined in dev', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const result = assertSecret('JWT_SECRET', undefined, { nodeEnv: 'development' })
    expect(result).toBe('')
    expect(warn).toHaveBeenCalledOnce()
  })

  it('does not warn when value is strong', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const result = assertSecret('JWT_SECRET', STRONG, { nodeEnv: 'development' })
    expect(result).toBe(STRONG)
    expect(warn).not.toHaveBeenCalled()
  })
})

/**
 * The denylist must track docker-compose.yml's placeholder strings exactly:
 * without an entry, the shipped placeholders clear every other check — over
 * 32 chars, and entropy just above the floor (3.56-3.78 against a 3.5
 * minimum). The images set NODE_ENV=production, which flips assertSecret
 * from warn to throw, so a placeholder deployment must fail at boot rather
 * than start cleanly.
 *
 * An exact-string list is defeated by a rename, so these assert the
 * *current* strings are caught AND that the marker-prefix rule catches the
 * next rename too.
 */
describe('assertSecret — shipped placeholders', () => {
  const COMPOSE_PLACEHOLDERS = [
    'change-me-jwt-secret-at-least-32-chars',
    'change-me-store-secret-at-least-32-chars',
    'change-me-to-a-long-random-string-at-least-32-chars',
  ]

  for (const p of COMPOSE_PLACEHOLDERS) {
    it(`rejects the docker-compose placeholder ${JSON.stringify(p.slice(0, 24))}…`, () => {
      expect(() => assertSecret('JWT_SECRET', p, { nodeEnv: 'production' })).toThrow(
        /placeholder/i,
      )
    })
  }

  it('rejects a future placeholder rename it has never seen', () => {
    // An exact-string list is defeated by a rename; anything announcing
    // itself as a placeholder is out.
    expect(() =>
      assertSecret('STORE_SECRET', 'change-me-some-brand-new-name-nobody-listed-yet', {
        nodeEnv: 'production',
      }),
    ).toThrow(/placeholder/i)
    expect(() =>
      assertSecret('STORE_SECRET', 'REPLACE-ME-WITH-SOMETHING-RANDOM-AND-LONG-ENOUGH', {
        nodeEnv: 'production',
      }),
    ).toThrow(/placeholder/i)
  })

  it('still accepts real generated secrets — no false positives', () => {
    // openssl rand -base64 48, openssl rand -hex 32, and a uuid-ish value.
    const real = [
      'JDdV7mQ2pXsL0aRfKu9YtBnE3wZcHg6iMoP1jS4vTxNqAeUyCbDkGlFhIrOw',
      'a3f5c9d1e7b2486fa0c4d8e6b1f39572c8a4e0d6b2f95713ac8e4d0b6f29571a',
      'rn0Xk9Qw-Tz4Lp7Vb2Yc6Hd8Sg1Mf3Jn5Rt7Wq9Zx0Ay2Bc4De6',
    ]
    for (const v of real) {
      expect(() => assertSecret('JWT_SECRET', v, { nodeEnv: 'production' })).not.toThrow()
    }
  })

  it('rejects a placeholder marker regardless of case or surrounding text', () => {
    expect(() =>
      assertSecret('ADMIN_SECRET', 'PLEASE-CHANGEME-BEFORE-DEPLOYING-THIS-ANYWHERE', {
        nodeEnv: 'production',
      }),
    ).toThrow(/placeholder/i)
  })
})
