/**
 * Pins env-over-YAML precedence for the SSO public URLs.
 *
 * Same shape as the `jwt` inversion pinned in config-secrets.test.ts, one line
 * below it: `sso: { ...defaults.sso, ...(parsed.sso ?? {}) }` spread YAML last,
 * so an `sso:` block in the mounted config/config.yml outranked
 * SSO_PUBLIC_BASE_URL / ADMIN_UI_URL from the environment — the exact
 * precedence the two lines above it exist to prevent.
 *
 * These URLs are where IdPs send SAML ACS / OIDC callbacks and where the
 * post-login handoff lands, so a stale YAML value doesn't fail loudly: it
 * sends the round-trip somewhere the operator didn't choose. No `sso:` key is
 * committed today, which is why nothing broke — the test pins the rule rather
 * than a live symptom.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { loadConfig } from '../../src/config'

const YAML_BASE = 'https://yaml-placeholder.example.com'
const YAML_UI = 'https://yaml-ui.example.com'
const ENV_BASE = 'https://sso.acme.internal'
const ENV_UI = 'https://admin.acme.internal'

const YAML = `
server:
  port: 3001
  host: 0.0.0.0
sso:
  publicBaseUrl: "${YAML_BASE}"
  adminUiUrl: "${YAML_UI}"
db:
  path: ./data/admin.db
`

let dir: string
const saved = {
  cfg: process.env.CONFIG_PATH,
  store: process.env.STORE_SECRET,
  base: process.env.SSO_PUBLIC_BASE_URL,
  ui: process.env.ADMIN_UI_URL,
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'admin-api-sso-'))
  const p = join(dir, 'config.yml')
  writeFileSync(p, YAML)
  process.env.CONFIG_PATH = p
  process.env.STORE_SECRET = 'store-secret-value-that-is-long-enough-xyz'
  delete process.env.SSO_PUBLIC_BASE_URL
  delete process.env.ADMIN_UI_URL
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
  const entries = [
    ['CONFIG_PATH', saved.cfg],
    ['STORE_SECRET', saved.store],
    ['SSO_PUBLIC_BASE_URL', saved.base],
    ['ADMIN_UI_URL', saved.ui],
  ] as const
  for (const [k, v] of entries) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
})

describe('sso config precedence', () => {
  it('lets the environment override a committed YAML sso block', () => {
    process.env.SSO_PUBLIC_BASE_URL = ENV_BASE
    process.env.ADMIN_UI_URL = ENV_UI
    const config = loadConfig()
    expect(config.sso.publicBaseUrl).toBe(ENV_BASE)
    expect(config.sso.adminUiUrl).toBe(ENV_UI)
  })

  it('overrides each URL independently', () => {
    process.env.SSO_PUBLIC_BASE_URL = ENV_BASE
    const config = loadConfig()
    expect(config.sso.publicBaseUrl).toBe(ENV_BASE)
    // Untouched by env — YAML still supplies it.
    expect(config.sso.adminUiUrl).toBe(YAML_UI)
  })

  it('keeps YAML as the fallback when the environment says nothing', () => {
    const config = loadConfig()
    expect(config.sso.publicBaseUrl).toBe(YAML_BASE)
    expect(config.sso.adminUiUrl).toBe(YAML_UI)
  })
})
