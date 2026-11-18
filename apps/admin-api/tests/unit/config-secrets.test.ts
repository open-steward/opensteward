/**
 * Pins env-over-YAML precedence for admin-api's JWT signing secret.
 *
 * `loadConfig` merges `{ ...defaults, ...parsed }` — defaults carry the
 * env-derived values, `parsed` is config.yml. The comment in that merge says
 * "Never let YAML override secrets/topology resolved from env above", but only
 * `storeSecret` was actually re-pinned. `jwt` was not, so a `jwt.secret`
 * committed in config/config.yml silently won over the `JWT_SECRET`
 * environment variable — and docker-compose.yml mounts that file into the
 * container, so every operator JWT in a compose deployment was signed with a
 * placeholder from the repo rather than the deployment's own secret.
 *
 * The fix is deliberately conditional rather than an unconditional
 * `jwt: defaults.jwt`. When `JWT_SECRET` is unset, `assertSecret` warns and
 * returns `''` outside production, and `@fastify/jwt` then refuses to register
 * with `missing secret` — so pinning unconditionally would trade the security
 * hole for a `pnpm dev` that cannot boot without an .env. Env wins when set;
 * YAML remains the local-dev fallback.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { loadConfig } from '../../src/config'

const YAML_SECRET = 'yaml-placeholder-secret-at-least-32-chars'
const ENV_SECRET = 'env-supplied-secret-that-is-also-long-enough-123'

const YAML = `
server:
  port: 3001
  host: 0.0.0.0
jwt:
  secret: "${YAML_SECRET}"
  expiresIn: "24h"
db:
  path: ./data/admin.db
`

let dir: string
const saved = { cfg: process.env.CONFIG_PATH, jwt: process.env.JWT_SECRET, store: process.env.STORE_SECRET }

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'admin-api-config-'))
  const p = join(dir, 'config.yml')
  writeFileSync(p, YAML)
  process.env.CONFIG_PATH = p
  // STORE_SECRET is asserted unconditionally; give it a valid value so these
  // tests exercise the jwt precedence rather than STORE_SECRET's own guard.
  process.env.STORE_SECRET = 'store-secret-value-that-is-long-enough-xyz'
  delete process.env.JWT_SECRET
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
  for (const [k, v] of [['CONFIG_PATH', saved.cfg], ['JWT_SECRET', saved.jwt], ['STORE_SECRET', saved.store]] as const) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
})

describe('loadConfig — jwt secret precedence', () => {
  it('lets JWT_SECRET win over a secret committed in config.yml', () => {
    process.env.JWT_SECRET = ENV_SECRET
    const config = loadConfig()
    expect(config.jwt.secret).toBe(ENV_SECRET)
    expect(config.jwt.secret).not.toBe(YAML_SECRET)
  })

  it('falls back to the config.yml secret when JWT_SECRET is unset, so local dev still boots', () => {
    // Without this fallback loadConfig would yield '' and @fastify/jwt refuses
    // to register with an empty secret ("missing secret").
    const config = loadConfig()
    expect(config.jwt.secret).toBe(YAML_SECRET)
    expect(config.jwt.secret).not.toBe('')
  })

  it('never yields an empty signing secret in either direction', () => {
    expect(loadConfig().jwt.secret).toBeTruthy()
    process.env.JWT_SECRET = ENV_SECRET
    expect(loadConfig().jwt.secret).toBeTruthy()
  })

  it('keeps storeSecret pinned to env regardless of YAML (unchanged behaviour)', () => {
    process.env.JWT_SECRET = ENV_SECRET
    expect(loadConfig().storeSecret).toBe(process.env.STORE_SECRET)
  })
})
