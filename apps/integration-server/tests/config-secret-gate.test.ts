/**
 * The credential vault's encryption root (STORE_SECRET) must be strength-gated
 * on the service that actually holds every platform credential — not just a
 * length check. admin, admin-api and integration-server all run STORE_SECRET
 * through assertSecret: a bare 32+ char length check would accept the shipped
 * compose placeholder (`change-me-…`, 40 chars) as the AES-256-GCM key — a
 * value anyone can read out of the repo.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { loadConfig } from '../src/config'

const STRONG = 'Kd9mZ2pQ7vX4tR1nB6wL0sJ3hF8yC5aE2gU7iO4kP1x'
const PLACEHOLDER = 'change-me-store-secret-at-least-32-chars'

describe('STORE_SECRET strength gate', () => {
  const saved: Record<string, string | undefined> = {}
  beforeEach(() => {
    for (const k of [
      'STORE_SECRET',
      'NODE_ENV',
      'CONFIG_PATH',
      'DATABASE_URL',
      'DATA_DATABASE_URL',
    ])
      saved[k] = process.env[k]
    // Isolate from any config.yml on disk.
    process.env['CONFIG_PATH'] = '/nonexistent/config.yml'
    delete process.env['DATABASE_URL']
    delete process.env['DATA_DATABASE_URL']
  })
  afterEach(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
  })

  it('rejects the compose placeholder in production (it clears the length check but not assertSecret)', () => {
    process.env['NODE_ENV'] = 'production'
    process.env['STORE_SECRET'] = PLACEHOLDER
    expect(PLACEHOLDER.length).toBeGreaterThanOrEqual(32) // proves length alone would pass
    expect(() => loadConfig()).toThrow(/STORE_SECRET/)
  })

  it('accepts a strong secret in production', () => {
    process.env['NODE_ENV'] = 'production'
    process.env['STORE_SECRET'] = STRONG
    expect(() => loadConfig()).not.toThrow()
  })

  it('still hard-rejects a too-short secret in every environment', () => {
    delete process.env['NODE_ENV']
    process.env['STORE_SECRET'] = 'too-short'
    expect(() => loadConfig()).toThrow(/at least 32/)
  })
})
