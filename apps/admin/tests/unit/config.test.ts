/**
 * The session secret signs admin session cookies. Getting its precedence wrong
 * is an authentication bypass, not a config nit.
 *
 * `apps/admin/config/config.yml` ships `session.secret: change-me-…`, and
 * docker-compose mounts that file into the container. loadConfig read
 * `parsed.session?.secret ?? assertSecret(...)` — YAML first — so a deployment
 * that set SESSION_SECRET correctly still signed its cookies with the
 * placeholder committed to the public repo, and anyone who could reach the
 * admin UI could forge an admin session. The YAML value also never passed
 * through assertSecret, so the placeholder's own guard never fired.
 *
 * Env wins; YAML stays the `pnpm dev` fallback; whichever is used gets
 * validated. admin-api's config.ts already handles its JWT secret this way.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { loadConfig } from '../../src/config.js'

const PLACEHOLDER = 'change-me-to-a-long-random-string-at-least-32-chars'
const REAL_SECRET = 'Zq4tR8vXn2LpKw7MbY5cHj3FdGs9NaEuTiPoQrVxWyZk'

let dir: string

/** Writes a config.yml like the one compose mounts, and points loadConfig at it. */
function withYaml(body: string): void {
  const path = join(dir, 'config.yml')
  writeFileSync(path, body)
  vi.stubEnv('CONFIG_PATH', path)
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'admin-config-'))
})

afterEach(() => {
  vi.unstubAllEnvs()
  rmSync(dir, { recursive: true, force: true })
})

describe('loadConfig — session secret precedence', () => {
  it('prefers SESSION_SECRET over the secret committed in config.yml', () => {
    withYaml(`session:\n  secret: ${PLACEHOLDER}\n`)
    vi.stubEnv('SESSION_SECRET', REAL_SECRET)
    expect(loadConfig().session.secret).toBe(REAL_SECRET)
  })

  it('falls back to config.yml so a bare `pnpm dev` still boots', () => {
    withYaml(`session:\n  secret: ${REAL_SECRET}\n`)
    vi.stubEnv('SESSION_SECRET', '')
    expect(loadConfig().session.secret).toBe(REAL_SECRET)
  })

  it('refuses to start in production on the committed placeholder', () => {
    withYaml(`session:\n  secret: ${PLACEHOLDER}\n`)
    vi.stubEnv('SESSION_SECRET', '')
    vi.stubEnv('NODE_ENV', 'production')
    expect(() => loadConfig()).toThrow(/SESSION_SECRET/)
  })

  it('warns rather than throwing on a weak secret outside production', () => {
    withYaml(`session:\n  secret: ${PLACEHOLDER}\n`)
    vi.stubEnv('SESSION_SECRET', '')
    vi.stubEnv('NODE_ENV', 'development')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(() => loadConfig()).not.toThrow()
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})

describe('loadConfig — URL precedence', () => {
  it('prefers ADMIN_API_URL over config.yml', () => {
    withYaml(`admin_api:\n  url: http://localhost:3001\nsession:\n  secret: ${REAL_SECRET}\n`)
    vi.stubEnv('ADMIN_API_URL', 'http://admin-api:3001')
    expect(loadConfig().admin_api.url).toBe('http://admin-api:3001')
  })

  it('prefers DOCS_SERVER_URL over config.yml', () => {
    withYaml(`docs_server:\n  url: http://localhost:3003\nsession:\n  secret: ${REAL_SECRET}\n`)
    vi.stubEnv('DOCS_SERVER_URL', 'https://docs.acme.example')
    expect(loadConfig().docs_server.url).toBe('https://docs.acme.example')
  })

  it('prefers SSO_PUBLIC_BASE_URL over config.yml', () => {
    withYaml(`sso:\n  publicBaseUrl: http://localhost:3001\nsession:\n  secret: ${REAL_SECRET}\n`)
    vi.stubEnv('SSO_PUBLIC_BASE_URL', 'https://admin.acme.example')
    expect(loadConfig().sso.publicBaseUrl).toBe('https://admin.acme.example')
  })
})
