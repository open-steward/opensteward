/**
 * Pins the env-over-YAML override for platform upstream URLs.
 *
 * `config/config.yml` ships `url: http://localhost:3010` for every platform,
 * which is correct for local dev and wrong inside a container — there
 * `localhost` is the gateway itself, so every forward hit ECONNREFUSED.
 * docker-compose.yml mounts that same file read-only into the container, so
 * editing the checked-in default would just break local dev instead.
 *
 * Every service in the compose stack takes its upstream from
 * `INTEGRATION_SERVER_URL` (admin-api, docs-server), following the convention
 * `loadConfig`'s own comment states: "env wins over YAML". This pins the
 * gateway's override.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { loadConfig } from '../../src/config'

const YAML = `
server:
  port: 3004
  host: 0.0.0.0
db:
  path: ./data/webhook-gateway.db
platforms:
  xero:
    vertical: accounting
    url: http://localhost:3010
    secret: ""
  fedex:
    vertical: logistics
    url: http://localhost:3010
    secret: "fedex-secret"
`

let dir: string
const saved = { cfg: process.env.CONFIG_PATH, url: process.env.INTEGRATION_SERVER_URL }

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'webhook-gw-config-'))
  const p = join(dir, 'config.yml')
  writeFileSync(p, YAML)
  process.env.CONFIG_PATH = p
  delete process.env.INTEGRATION_SERVER_URL
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
  if (saved.cfg === undefined) delete process.env.CONFIG_PATH
  else process.env.CONFIG_PATH = saved.cfg
  if (saved.url === undefined) delete process.env.INTEGRATION_SERVER_URL
  else process.env.INTEGRATION_SERVER_URL = saved.url
})

describe('loadConfig platform URLs', () => {
  it('keeps the YAML url when INTEGRATION_SERVER_URL is unset (local dev is unaffected)', () => {
    const config = loadConfig()
    expect(config.platforms.xero?.url).toBe('http://localhost:3010')
    expect(config.platforms.fedex?.url).toBe('http://localhost:3010')
  })

  it('lets INTEGRATION_SERVER_URL override every platform url (the container case)', () => {
    process.env.INTEGRATION_SERVER_URL = 'http://integration-server:3010'
    const config = loadConfig()
    expect(config.platforms.xero?.url).toBe('http://integration-server:3010')
    expect(config.platforms.fedex?.url).toBe('http://integration-server:3010')
  })

  it('overrides only the url, preserving each platform vertical and secret', () => {
    process.env.INTEGRATION_SERVER_URL = 'http://integration-server:3010'
    const config = loadConfig()
    expect(config.platforms.fedex?.vertical).toBe('logistics')
    expect(config.platforms.fedex?.secret).toBe('fedex-secret')
    expect(config.platforms.xero?.vertical).toBe('accounting')
  })

  it('ignores an empty INTEGRATION_SERVER_URL rather than blanking the upstream', () => {
    process.env.INTEGRATION_SERVER_URL = ''
    const config = loadConfig()
    expect(config.platforms.xero?.url).toBe('http://localhost:3010')
  })
})
