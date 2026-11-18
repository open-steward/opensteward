import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { generateKeyPairSync, sign, type KeyObject } from 'node:crypto'
import {
  chmodSync,
  copyFileSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
  mkdirSync,
} from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import Database from 'better-sqlite3'
import { openDb } from '@opensteward/shared'
import { assembleToken, buildSigningInput, type LicensePayload } from '@opensteward/license-token'
import {
  runDoctor,
  renderReport,
  checkEnvSecrets,
  checkEnvDrift,
  checkConfigDrift,
  checkSchemaVersions,
  checkEncryptedBlobs,
  checkVolumesAndFreeSpace,
  checkComposeOverride,
  checkLicense,
  composeLicenseFileDefault,
  containerUserCan,
  parseDfFreeBytes,
  parseComposeVolumes,
  extractDeclaredEnvNames,
  flattenYamlKeys,
  type CheckResult,
  type DoctorOptions,
} from '../../src/scripts/doctor'
import { CredentialStore } from '../../src/auth/store'
import { AdapterSettingsStore } from '../../src/adapter/settings-store'
import { applyMigrations } from '../../src/sqlite/migrate'

const STRONG_STORE_SECRET = 'strong-store-secret-with-plenty-of-entropy-xyz123'
const STRONG_JWT_SECRET = 'strong-jwt-secret-with-plenty-of-entropy-abc456!'
const STRONG_SESSION_SECRET = 'strong-session-secret-plenty-of-entropy-def789'
const STRONG_ADMIN_SECRET = 'strong-admin-secret-with-plenty-of-entropy-ghi012'

/**
 * Convenience: a complete env that passes assertSecret for the doctor's
 * required-vars check. Tests start from this and mutate one field at a time.
 */
function strongEnv(): NodeJS.ProcessEnv {
  return {
    STORE_SECRET: STRONG_STORE_SECRET,
    JWT_SECRET: STRONG_JWT_SECRET,
    SESSION_SECRET: STRONG_SESSION_SECRET,
    ADMIN_SECRET: STRONG_ADMIN_SECRET,
  }
}

function tmp(): string {
  return mkdtempSync(join(tmpdir(), 'doctor-test-'))
}

function writeEnvExample(root: string): void {
  // Mirror the structure that extractDeclaredEnvNames expects.
  const content = `# OpenSteward .env.example
#
# ── Required ──────────────────────────────────────────────────
# These MUST be set in production.

# JWT_SECRET — REQUIRED
#   HMAC key.
#   read by: apps/admin-api/src/config.ts
JWT_SECRET=

# SESSION_SECRET — REQUIRED
#   Cookie key.
#   read by: apps/admin/src/config.ts
SESSION_SECRET=

# STORE_SECRET — REQUIRED
#   AES key.
#   read by: apps/admin-api/src/config.ts
STORE_SECRET=

# ── Optional ──────────────────────────────────────────────────
# These are optional.

# ADMIN_SECRET — optional
#   Bearer token gating control-plane.
#   read by: packages/shared/src/control-plane/admin-guard.ts
ADMIN_SECRET=

# NODE_ENV — optional
#   Runtime environment.
#   read by: apps/admin/src/config.ts
NODE_ENV=

# PORT — optional
#   TCP port.
#   read by: apps/integration-server/src/config.ts
PORT=
`
  writeFileSync(join(root, '.env.example'), content)
}

function writeEnvFile(root: string, content: string): void {
  writeFileSync(join(root, '.env'), content)
}

async function makeIntegrationDb(path: string, secret: string): Promise<void> {
  // Use the real stores so migrations + encrypted seeds run through the
  // same code paths a live deployment uses. Both stores share ONE handle on
  // the same file (like boot); the handle is closed before the doctor reads
  // the db so the WAL is flushed.
  const handle = await openDb({ sqlitePath: path })
  const credentials = await CredentialStore.create(handle, secret)
  await credentials.create(
    'shopify',
    'tenant_1',
    { accessToken: 'tok' },
    'desc',
    'ecommerce',
    'owner_1',
  )
  const settings = await AdapterSettingsStore.create(handle, secret)
  await settings.upsert('ecommerce', 'shopify', {
    enabled: true,
    config: { clientId: 'cid', clientSecret: 'shhh' },
  })
  await handle.close()
}

describe('parseDfFreeBytes', () => {
  it('extracts free bytes from POSIX df -k output', () => {
    const out = [
      'Filesystem    1024-blocks      Used Available Capacity  Mounted on',
      '/dev/disk1s1   970000000   400000000  570000000    42%  /',
    ].join('\n')
    expect(parseDfFreeBytes(out)).toBe(570000000 * 1024)
  })

  it('returns null on garbage', () => {
    expect(parseDfFreeBytes('not df output')).toBeNull()
  })
})

describe('parseComposeVolumes', () => {
  it('returns named volumes only', () => {
    const yaml = `services:
  a:
    image: x
volumes:
  data1:
  data2:
`
    expect(parseComposeVolumes(yaml)).toEqual(['data1', 'data2'])
  })

  it('returns empty when no volumes block', () => {
    expect(parseComposeVolumes('services:\n  a:\n    image: x\n')).toEqual([])
  })

  // "the file declares no volumes" and "the file could not be parsed" are
  // different facts and doctor reports them differently, so the parser must
  // not flatten the second into the first.
  it('throws on unparseable YAML rather than reporting no volumes', () => {
    expect(() => parseComposeVolumes('volumes:\n  a: [unclosed\n')).toThrow()
  })
})

describe('extractDeclaredEnvNames', () => {
  it('separates required from optional based on header annotations', () => {
    const content = `# header
# ── Required ──────────
# STORE_SECRET — REQUIRED
#   foo
STORE_SECRET=
# ── Optional ──────────
# PORT — optional
#   bar
PORT=
`
    const { required, optional } = extractDeclaredEnvNames(content)
    expect(required).toEqual(['STORE_SECRET'])
    expect(optional).toEqual(['PORT'])
  })
})

describe('flattenYamlKeys', () => {
  it('flattens nested objects to dotted paths', () => {
    const obj = { a: { b: { c: 1 }, d: 2 }, e: 3 }
    expect(flattenYamlKeys(obj).sort()).toEqual(['a.b.c', 'a.d', 'e'])
  })

  it('treats arrays as leaves', () => {
    expect(flattenYamlKeys({ a: [1, 2, 3] })).toEqual(['a'])
  })
})

describe('checkEnvSecrets', () => {
  it('passes when every required secret is strong and ADMIN_SECRET present', () => {
    const results = checkEnvSecrets(strongEnv())
    const byStatus = results.map((r) => r.status)
    expect(byStatus.filter((s) => s === 'FAIL')).toHaveLength(0)
    expect(byStatus.filter((s) => s === 'WARN')).toHaveLength(0)
  })

  it('FAILs when a required secret is missing', () => {
    const env = strongEnv()
    delete env.STORE_SECRET
    const results = checkEnvSecrets(env)
    const storeRow = results.find((r) => r.name === 'env: STORE_SECRET')
    expect(storeRow?.status).toBe('FAIL')
    expect(storeRow?.detail).toContain('not set')
  })

  it('FAILs when a required secret is denylisted', () => {
    const env = strongEnv()
    env.JWT_SECRET = 'changeme'
    const results = checkEnvSecrets(env)
    const row = results.find((r) => r.name === 'env: JWT_SECRET')
    expect(row?.status).toBe('FAIL')
  })

  it('WARNs when ADMIN_SECRET is unset', () => {
    const env = strongEnv()
    delete env.ADMIN_SECRET
    const results = checkEnvSecrets(env)
    const row = results.find((r) => r.name === 'env: ADMIN_SECRET')
    expect(row?.status).toBe('WARN')
  })
})

describe('checkEnvDrift', () => {
  let root: string

  beforeEach(() => {
    root = tmp()
    writeEnvExample(root)
  })
  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('returns INFO when no .env exists', () => {
    const results = checkEnvDrift({ repoRoot: root })
    expect(results[0].status).toBe('INFO')
  })

  it('PASSes when .env covers every declared name', () => {
    writeEnvFile(
      root,
      [
        `STORE_SECRET=${STRONG_STORE_SECRET}`,
        `JWT_SECRET=${STRONG_JWT_SECRET}`,
        `SESSION_SECRET=${STRONG_SESSION_SECRET}`,
        `ADMIN_SECRET=${STRONG_ADMIN_SECRET}`,
        `NODE_ENV=production`,
        `PORT=3000`,
      ].join('\n'),
    )
    const results = checkEnvDrift({ repoRoot: root })
    const required = results.find((r) => r.name === 'env: required vars in .env')
    const optional = results.find((r) => r.name === 'env: optional vars in .env')
    expect(required?.status).toBe('PASS')
    expect(optional?.status).toBe('PASS')
  })

  it('FAILs when a required var is missing from .env', () => {
    writeEnvFile(
      root,
      [
        `JWT_SECRET=${STRONG_JWT_SECRET}`,
        `SESSION_SECRET=${STRONG_SESSION_SECRET}`,
      ].join('\n'),
    )
    const results = checkEnvDrift({ repoRoot: root })
    const required = results.find((r) => r.name === 'env: required vars in .env')
    expect(required?.status).toBe('FAIL')
    expect(required?.detail).toContain('STORE_SECRET')
  })

  it('WARNs when an optional is missing', () => {
    writeEnvFile(
      root,
      [
        `STORE_SECRET=${STRONG_STORE_SECRET}`,
        `JWT_SECRET=${STRONG_JWT_SECRET}`,
        `SESSION_SECRET=${STRONG_SESSION_SECRET}`,
      ].join('\n'),
    )
    const results = checkEnvDrift({ repoRoot: root })
    const optional = results.find((r) => r.name === 'env: optional vars in .env')
    expect(optional?.status).toBe('WARN')
    expect(optional?.detail).toContain('ADMIN_SECRET')
  })

  it('WARNs about unknown vars in .env', () => {
    writeEnvFile(
      root,
      [
        `STORE_SECRET=${STRONG_STORE_SECRET}`,
        `JWT_SECRET=${STRONG_JWT_SECRET}`,
        `SESSION_SECRET=${STRONG_SESSION_SECRET}`,
        `ADMIN_SECRET=${STRONG_ADMIN_SECRET}`,
        `NODE_ENV=dev`,
        `PORT=3010`,
        `MYSTERY_VAR=foo`,
      ].join('\n'),
    )
    const results = checkEnvDrift({ repoRoot: root })
    const unknown = results.find((r) => r.name === 'env: unknown vars in .env')
    expect(unknown?.status).toBe('WARN')
    expect(unknown?.detail).toContain('MYSTERY_VAR')
  })
})

describe('checkConfigDrift', () => {
  let root: string

  beforeEach(() => {
    root = tmp()
    mkdirSync(join(root, 'apps/admin-api/config'), { recursive: true })
  })
  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('PASSes when keys match', () => {
    writeFileSync(
      join(root, 'apps/admin-api/config/config.example.yml'),
      'server:\n  port: 3001\n  host: 0.0.0.0\n',
    )
    writeFileSync(
      join(root, 'apps/admin-api/config/config.yml'),
      'server:\n  port: 3001\n  host: 0.0.0.0\n',
    )
    const results = checkConfigDrift({ repoRoot: root })
    expect(results[0].status).toBe('PASS')
  })

  it('WARNs when example has a key the operator file is missing', () => {
    writeFileSync(
      join(root, 'apps/admin-api/config/config.example.yml'),
      'server:\n  port: 3001\nfeature_flag: false\n',
    )
    writeFileSync(
      join(root, 'apps/admin-api/config/config.yml'),
      'server:\n  port: 3001\n',
    )
    const results = checkConfigDrift({ repoRoot: root })
    const row = results.find((r) => r.name === 'config: admin-api')
    expect(row?.status).toBe('WARN')
    expect(row?.detail).toContain('feature_flag')
  })

  it('WARNs when operator file has a key the example does not', () => {
    writeFileSync(
      join(root, 'apps/admin-api/config/config.example.yml'),
      'server:\n  port: 3001\n',
    )
    writeFileSync(
      join(root, 'apps/admin-api/config/config.yml'),
      'server:\n  port: 3001\ntypo_setting: 42\n',
    )
    const results = checkConfigDrift({ repoRoot: root })
    const row = results.find((r) => r.name === 'config: admin-api')
    expect(row?.status).toBe('WARN')
    expect(row?.detail).toContain('typo_setting')
  })
})

describe('checkSchemaVersions', () => {
  let root: string
  let dbPath: string

  beforeEach(() => {
    root = tmp()
    dbPath = join(root, 'integration.db')
  })
  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('returns INFO when db does not exist', () => {
    const results = checkSchemaVersions({
      repoRoot: root,
      dbPaths: { integrationServer: dbPath },
    })
    const row = results.find((r) => r.name === 'schema: integration-server')
    expect(row?.status).toBe('INFO')
  })

  it('reports highest applied version per namespace', () => {
    // Build a real db with two namespaces via applyMigrations.
    const db = new Database(dbPath)
    applyMigrations(db, 'fake_ns_a', [
      { version: 1, sql: 'CREATE TABLE a1 (id INTEGER)' },
      { version: 2, sql: 'CREATE TABLE a2 (id INTEGER)' },
    ])
    applyMigrations(db, 'fake_ns_b', [{ version: 1, sql: 'CREATE TABLE b1 (id INTEGER)' }])
    db.close()
    const results = checkSchemaVersions({
      repoRoot: root,
      dbPaths: { integrationServer: dbPath },
    })
    const row = results.find((r) => r.name === 'schema: integration-server')
    expect(row?.status).toBe('PASS')
    expect(row?.detail).toContain('fake_ns_a=v2')
    expect(row?.detail).toContain('fake_ns_b=v1')
  })
})

describe('checkEncryptedBlobs', () => {
  let root: string
  let dbPath: string

  beforeEach(() => {
    root = tmp()
    dbPath = join(root, 'integration.db')
  })
  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('PASSes when seeded data decrypts under the configured STORE_SECRET', async () => {
    await makeIntegrationDb(dbPath, STRONG_STORE_SECRET)
    const results = checkEncryptedBlobs({
      repoRoot: root,
      env: { STORE_SECRET: STRONG_STORE_SECRET },
      dbPaths: { integrationServer: dbPath },
    })
    const credentials = results.find((r) =>
      r.name.includes('integration-server.credentials.data'),
    )
    expect(credentials?.status).toBe('PASS')
    const adapter = results.find((r) =>
      r.name.includes('integration-server.adapter_settings.encrypted_config'),
    )
    expect(adapter?.status).toBe('PASS')
  })

  it('FAILs loud when STORE_SECRET is wrong for the data on disk', async () => {
    await makeIntegrationDb(dbPath, STRONG_STORE_SECRET)
    const results = checkEncryptedBlobs({
      repoRoot: root,
      env: { STORE_SECRET: 'wrong-but-still-passes-length-check-xyzaaa' },
      dbPaths: { integrationServer: dbPath },
    })
    const credentials = results.find((r) =>
      r.name.includes('integration-server.credentials.data'),
    )
    expect(credentials?.status).toBe('FAIL')
    expect(credentials?.detail).toMatch(/decrypt failed/i)
    expect(credentials?.detail).toMatch(/STORE_SECRET/)
  })

  it('emits INFO when there are no encrypted rows yet', async () => {
    // Build the schema (CredentialStore) but never insert any rows.
    const handle = await openDb({ sqlitePath: dbPath })
    await CredentialStore.create(handle, STRONG_STORE_SECRET)
    await handle.close()
    const results = checkEncryptedBlobs({
      repoRoot: root,
      env: { STORE_SECRET: STRONG_STORE_SECRET },
      dbPaths: { integrationServer: dbPath },
    })
    const credentials = results.find((r) =>
      r.name.includes('integration-server.credentials.data'),
    )
    expect(credentials?.status).toBe('INFO')
  })
})

describe('checkVolumesAndFreeSpace', () => {
  let root: string

  beforeEach(() => {
    root = tmp()
    writeFileSync(
      join(root, 'docker-compose.yml'),
      [
        'services:',
        '  admin:',
        '    image: x',
        'volumes:',
        '  admin-data:',
        '  integration-server-data:',
      ].join('\n'),
    )
  })
  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('PASSes when every volume resolves and has plenty of free space', () => {
    // Pretend df reports 10 GiB free (10 * 1024 * 1024 KB = 10 GiB).
    const TEN_GIB_KB = 10 * 1024 * 1024
    const execShim = (cmd: string): string => {
      if (cmd.startsWith('docker volume inspect')) return '/var/lib/docker/volumes/x/_data\n'
      if (cmd.startsWith('df -k')) {
        return `Filesystem 1024-blocks Used Available Capacity Mounted-on\n/dev/x ${TEN_GIB_KB * 2} ${TEN_GIB_KB} ${TEN_GIB_KB} 50% /\n`
      }
      throw new Error(`unexpected cmd: ${cmd}`)
    }
    const results = checkVolumesAndFreeSpace({ repoRoot: root, execShim })
    expect(results.filter((r) => r.name.startsWith('volume:')).every((r) => r.status === 'PASS')).toBe(
      true,
    )
  })

  it('WARNs when free space is under 1 GiB', () => {
    const HALF_GIB_KB = (1024 * 1024) / 2
    const execShim = (cmd: string): string => {
      if (cmd.startsWith('docker volume inspect')) return '/var/lib/docker/volumes/x/_data\n'
      if (cmd.startsWith('df -k')) {
        return `Filesystem 1024-blocks Used Available Capacity Mounted-on\n/dev/x 999999 99 ${HALF_GIB_KB} 99% /\n`
      }
      throw new Error(`unexpected cmd: ${cmd}`)
    }
    const results = checkVolumesAndFreeSpace({ repoRoot: root, execShim })
    expect(results.filter((r) => r.name.startsWith('volume:')).every((r) => r.status === 'WARN')).toBe(
      true,
    )
  })

  it('WARNs when docker volume inspect fails for every candidate name', () => {
    const execShim = (cmd: string): string => {
      if (cmd.startsWith('docker volume inspect')) throw new Error('Error: No such volume')
      return ''
    }
    const results = checkVolumesAndFreeSpace({ repoRoot: root, execShim })
    expect(
      results.filter((r) => r.name.startsWith('volume:')).every((r) => r.status === 'WARN'),
    ).toBe(true)
  })

  // An unreadable compose file must never be reported as a compose file that
  // declares nothing: the operator runs doctor precisely to be told whether
  // the volume/free-space check ran.
  it('FAILs — not INFO "no named volumes" — when docker-compose.yml is unparseable', () => {
    writeFileSync(join(root, 'docker-compose.yml'), 'volumes:\n  admin-data: [unclosed\n')
    const execShim = (cmd: string): string => {
      throw new Error(`unexpected cmd: ${cmd}`)
    }
    const results = checkVolumesAndFreeSpace({ repoRoot: root, execShim })
    expect(results.some((r) => r.detail.includes('no named volumes'))).toBe(false)
    const row = results.find((r) => r.status === 'FAIL')
    expect(row).toBeDefined()
    expect(row?.detail).toMatch(/pars/i)
  })

  it('exits non-zero from runDoctor when docker-compose.yml is unparseable', () => {
    writeFileSync(join(root, 'docker-compose.yml'), 'volumes:\n  admin-data: [unclosed\n')
    const report = runDoctor({
      repoRoot: root,
      env: strongEnv(),
      execShim: () => '',
      gitDiffShim: () => false,
    })
    expect(report.exitCode).toBe(1)
  })
})

describe('checkComposeOverride', () => {
  let root: string

  beforeEach(() => {
    root = tmp()
    writeFileSync(join(root, 'docker-compose.yml'), 'services: {}\n')
  })
  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('PASSes when compose is clean and override is absent', () => {
    const results = checkComposeOverride({ repoRoot: root, gitDiffShim: () => false })
    expect(results[0].status).toBe('PASS')
  })

  it('WARNs when compose is dirty and no override exists', () => {
    const results = checkComposeOverride({ repoRoot: root, gitDiffShim: () => true })
    expect(results[0].status).toBe('WARN')
    expect(results[0].detail).toContain('docker-compose.override.yml')
  })

  it('still WARNs when override exists but base is dirty', () => {
    writeFileSync(join(root, 'docker-compose.override.yml'), 'services: {}\n')
    const results = checkComposeOverride({ repoRoot: root, gitDiffShim: () => true })
    expect(results[0].status).toBe('WARN')
  })
})

describe('composeLicenseFileDefault', () => {
  it("reads OPENSTEWARD_LICENSE_FILE's ${VAR:-default} from docker-compose.yml", () => {
    const yml =
      'services:\n  integration-server:\n    environment:\n      - OPENSTEWARD_LICENSE_FILE=${OPENSTEWARD_LICENSE_FILE:-/etc/opensteward/license/license.key}\n'
    expect(composeLicenseFileDefault(yml)).toBe('/etc/opensteward/license/license.key')
  })

  it('is null when compose does not forward the variable', () => {
    expect(composeLicenseFileDefault('services:\n  admin:\n    image: x\n')).toBeNull()
  })
})

describe('containerUserCan', () => {
  // uid and gid 1000 are the image's node user; 501:20 is a typical macOS host user.
  const st = (mode: number, uid = 501, gid = 20) => ({ mode: 0o100000 | mode, uid, gid })
  const READ = 4
  const SEARCH = 1

  it("reads everyone's bits when uid 1000 neither owns the file nor shares its group", () => {
    expect(containerUserCan(st(0o644), READ)).toBe(true)
    expect(containerUserCan(st(0o600), READ)).toBe(false)
    expect(containerUserCan(st(0o711), SEARCH)).toBe(true)
    expect(containerUserCan(st(0o700), SEARCH)).toBe(false)
    expect(containerUserCan(st(0o711), READ | SEARCH)).toBe(false) // every bit asked for
  })

  it("reads the owner's bits when uid 1000 owns it, even if everyone else has more", () => {
    expect(containerUserCan(st(0o600, 1000), READ)).toBe(true)
    expect(containerUserCan(st(0o044, 1000), READ)).toBe(false)
  })

  it("reads the group's bits when gid 1000 owns it and uid 1000 does not", () => {
    expect(containerUserCan(st(0o640, 501, 1000), READ)).toBe(true)
    expect(containerUserCan(st(0o604, 501, 1000), READ)).toBe(false)
  })
})

describe('checkLicense', () => {
  const k1 = generateKeyPairSync('ed25519')
  const k2 = generateKeyPairSync('ed25519')
  const raw = (k: KeyObject) => k.export({ format: 'jwk' }).x as string
  const PRIVATE: Record<string, KeyObject> = { test1: k1.privateKey, other1: k2.privateKey }
  // `other1` verifies but is not a production kid: a stand-in for a dev key.
  const KEYRING = {
    keyMap: { test1: raw(k1.publicKey), other1: raw(k2.publicKey) },
    productionKids: ['test1'],
  }
  const NOW = Date.parse('2026-10-09T12:00:00Z')
  /** integration-server in a docker-compose.yml with these volumes, forwarding the license file variable. */
  const compose = (...volumes: string[]): string =>
    'services:\n  integration-server:\n' +
    (volumes.length > 0 ? `    volumes:\n${volumes.map((v) => `      - ${v}\n`).join('')}` : '') +
    '    environment:\n      - OPENSTEWARD_LICENSE_FILE=${OPENSTEWARD_LICENSE_FILE:-/etc/opensteward/license/license.key}\n'
  /** docker-compose.yml as A3.5 landed it: ./opensteward-license mounted read-only at the container path. */
  const COMPOSE = compose('./opensteward-license:/etc/opensteward/license:ro')
  /** The repository's own docker-compose.yml. */
  const REPO_COMPOSE = join(__dirname, '../../../../docker-compose.yml')

  function mint(over: Partial<LicensePayload> = {}, kid = 'test1'): string {
    const payload: LicensePayload = {
      iss: 'opensteward.dev',
      aud: 'opensteward',
      sub: 'lic_doctor01',
      org: 'Acme Forsakring AB',
      tier: 'free',
      env: 'prod',
      features: ['mcp', 'vertical:accounting'],
      limits: { connections: 5, tenants: 1 },
      iat: '2026-10-06T17:00:00Z',
      nbf: '2026-10-06T17:00:00Z',
      exp: '2027-10-06T17:00:00Z',
      ver: 1,
      ...over,
    }
    const footer = { kid }
    const signature = sign(null, Buffer.from(buildSigningInput(payload, footer)), PRIVATE[kid]!)
    return assembleToken(payload, footer, new Uint8Array(signature))
  }

  let root: string
  beforeEach(() => {
    root = tmp()
    mkdirSync(join(root, 'apps/integration-server/data'), { recursive: true })
  })
  afterEach(() => rmSync(root, { recursive: true, force: true }))

  const run = (env: NodeJS.ProcessEnv = {}, over: Partial<DoctorOptions> = {}): CheckResult[] =>
    checkLicense({ repoRoot: root, env, licenseKeyring: KEYRING, now: () => NOW, ...over })
  const state = (rs: CheckResult[]) => rs.find((r) => r.name === 'license: state')!
  const row = (rs: CheckResult[], name: string) => rs.find((r) => r.name === name)
  const dataKey = () => join(root, 'apps/integration-server/data/license.key')
  /** Writes `token` to `<dir>/license.key` under the root, creating the folder. */
  const putKey = (dir: string, token: string): string => {
    mkdirSync(join(root, dir), { recursive: true })
    writeFileSync(join(root, dir, 'license.key'), token)
    return join(root, dir, 'license.key')
  }

  it('PASS for a valid production-key license in OPENSTEWARD_LICENSE; never prints the token', () => {
    const token = mint()
    const rs = run({ OPENSTEWARD_LICENSE: token })
    expect(state(rs).status).toBe('PASS')
    expect(state(rs).detail).toMatch(/^VALID/)
    expect(state(rs).detail).toContain('Acme Forsakring AB') // A2c-3's log line names the org
    expect(state(rs).detail).toContain('from OPENSTEWARD_LICENSE, key test1')
    expect(JSON.stringify(rs)).not.toContain(token.split('.')[2]!.slice(0, 40))
  })

  it("reads license.key next to integration-server's STORE_PATH by default", () => {
    writeFileSync(dataKey(), mint() + '\n')
    const r = state(run())
    expect(r.status).toBe('PASS')
    expect(r.detail).toContain('from apps/integration-server/data/license.key')
  })

  it('follows STORE_PATH from .env, relative to apps/integration-server', () => {
    mkdirSync(join(root, 'apps/integration-server/state'))
    writeFileSync(join(root, 'apps/integration-server/state/license.key'), mint())
    writeFileSync(join(root, '.env'), 'STORE_PATH=./state/credentials.db\n')
    expect(state(run()).detail).toContain('from apps/integration-server/state/license.key')
  })

  it('an empty OPENSTEWARD_LICENSE is unset: the file is read (compose forwards ${VAR:-} as "")', () => {
    writeFileSync(dataKey(), mint())
    expect(state(run({ OPENSTEWARD_LICENSE: '' })).status).toBe('PASS')
  })

  it('an empty OPENSTEWARD_LICENSE_FILE (a .env copied from .env.example) falls through to the docker-compose.yml default', () => {
    // .env.example writes optional knobs as `VAR=`. Compose's ${VAR:-default}
    // treats '' as unset, so the server reads the default, and doctor must too.
    writeFileSync(join(root, 'docker-compose.yml'), COMPOSE)
    writeFileSync(join(root, '.env'), 'OPENSTEWARD_LICENSE=\nOPENSTEWARD_LICENSE_FILE=\n')
    putKey('opensteward-license', mint())
    const r = state(run({ OPENSTEWARD_LICENSE_FILE: '' }))
    expect(r.status).toBe('PASS')
    expect(r.detail).toContain('from opensteward-license/license.key')
  })

  it("docker-compose.yml's container path is read from ./opensteward-license/, the folder it mounts", () => {
    writeFileSync(join(root, 'docker-compose.yml'), COMPOSE)
    putKey('opensteward-license', mint())
    const rs = run()
    const r = state(rs)
    expect(r.status).toBe('PASS')
    expect(r.detail).toContain('from opensteward-license/license.key')
    expect(r.detail).toContain(
      '/etc/opensteward/license/license.key is a container path; read ./opensteward-license/, which docker-compose.yml mounts there',
    )
    // compose points integration-server at it, so it is not an unused file
    expect(row(rs, 'license: file')).toBeUndefined()
    expect(row(rs, 'license: source run')).toBeUndefined()
  })

  it("the repository's own docker-compose.yml is followed to ./opensteward-license/", () => {
    // Pins doctor's host folder to the mount compose really ships (A3.5).
    copyFileSync(REPO_COMPOSE, join(root, 'docker-compose.yml'))
    putKey('opensteward-license', mint())
    const rs = run()
    const r = state(rs)
    expect(r.status).toBe('PASS')
    expect(r.detail).toContain('from opensteward-license/license.key')
    expect(r.detail).toContain('read ./opensteward-license/, which docker-compose.yml mounts there')
    expect(row(rs, 'license: file')).toBeUndefined()
  })

  it.each([
    ['short', '- ./other-license:/etc/opensteward/license:ro'],
    [
      'long',
      '- type: bind\n        source: ./other-license\n        target: /etc/opensteward/license/',
    ],
  ])(
    "docker-compose.override.yml's %s-syntax mount wins over docker-compose.yml's ./opensteward-license mount",
    (_syntax, volume) => {
      // Both files mount the container path; compose merges volumes by target, so the override's wins.
      writeFileSync(join(root, 'docker-compose.yml'), COMPOSE)
      writeFileSync(
        join(root, 'docker-compose.override.yml'),
        `services:\n  integration-server:\n    volumes:\n      ${volume}\n`,
      )
      putKey('other-license', mint({ org: 'Override Org AB' }))
      putKey('opensteward-license', mint({ org: 'Stale Org AB' }))
      const rs = run()
      const r = state(rs)
      expect(r.status).toBe('PASS')
      expect(r.detail).toContain('Override Org AB')
      expect(r.detail).not.toContain('Stale Org AB')
      expect(r.detail).toContain('from other-license/license.key')
      expect(r.detail).toContain(
        'read ./other-license/, which docker-compose.override.yml mounts there',
      )
      // The override replaced the ./opensteward-license mount, so that file is now unused.
      expect(row(rs, 'license: file')?.status).toBe('INFO')
    },
  )

  it("docker-compose.yml's own mount at the container path is followed", () => {
    writeFileSync(join(root, 'docker-compose.yml'), compose('./keys:/etc/opensteward/license:ro'))
    putKey('keys', mint())
    const r = state(run())
    expect(r.status).toBe('PASS')
    expect(r.detail).toContain('read ./keys/, which docker-compose.yml mounts there')
  })

  it('with no compose mount at the container path, ./opensteward-license/ is read and the note says nothing mounts it', () => {
    writeFileSync(join(root, 'docker-compose.yml'), compose())
    putKey('opensteward-license', mint())
    const rs = run()
    const r = state(rs)
    expect(r.status).toBe('PASS')
    expect(r.detail).toContain('from opensteward-license/license.key')
    expect(r.detail).toContain(
      'no compose file doctor read mounts a folder there; read ./opensteward-license/, the folder docker-compose.yml mounts as shipped',
    )
    expect(r.detail).not.toContain('which docker-compose')
    expect(row(rs, 'license: file')).toBeUndefined()
  })

  it('a ~/ host path in the mount resolves from the home directory, as compose does', () => {
    vi.stubEnv('HOME', root)
    try {
      writeFileSync(join(root, 'docker-compose.yml'), COMPOSE)
      writeFileSync(
        join(root, 'docker-compose.override.yml'),
        'services:\n  integration-server:\n    volumes:\n      - ~/lic:/etc/opensteward/license:ro\n',
      )
      mkdirSync(join(root, 'lic'))
      writeFileSync(join(root, 'lic/license.key'), mint())
      const r = state(run())
      expect(r.status).toBe('PASS')
      expect(r.detail).toContain('from lic/license.key')
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('a named volume at the container path is reported, and ./opensteward-license/ is not read in its place', () => {
    writeFileSync(join(root, 'docker-compose.yml'), COMPOSE)
    writeFileSync(
      join(root, 'docker-compose.override.yml'),
      'services:\n  integration-server:\n    volumes:\n      - license-data:/etc/opensteward/license:ro\n',
    )
    putKey('opensteward-license', mint())
    const rs = run()
    const r = state(rs)
    expect(r.status).toBe('WARN')
    expect(r.detail).toMatch(/^MISSING/)
    expect(r.detail).toContain(
      'docker-compose.override.yml mounts license-data there, which doctor cannot read from this host',
    )
    // The named volume replaced the ./opensteward-license mount, so that file is unused.
    expect(row(rs, 'license: file')?.status).toBe('INFO')
  })

  it.each([
    ['short syntax, ${VAR:-default}', '- ${LIC_DIR:-./custom}:/etc/opensteward/license:ro'],
    ['short syntax, ${VAR:?error}', '- ${LIC_DIR:?set LIC_DIR}:/etc/opensteward/license'],
    [
      'long syntax',
      '- type: bind\n        source: ${LIC_DIR:-./custom}\n        target: /etc/opensteward/license',
    ],
  ])('an interpolated source with its own ":" (%s) is reported, not guessed', (_syntax, volume) => {
    // Split on every ':', `${LIC_DIR:-./custom}:/etc/...` never matched the target, so
    // doctor fell back to docker-compose.yml's ./opensteward-license mount and passed.
    writeFileSync(join(root, 'docker-compose.yml'), COMPOSE)
    writeFileSync(
      join(root, 'docker-compose.override.yml'),
      `services:\n  integration-server:\n    volumes:\n      ${volume}\n`,
    )
    putKey('opensteward-license', mint())
    const rs = run()
    const r = state(rs)
    expect(r.status).toBe('WARN')
    expect(r.detail).toMatch(/^MISSING/)
    expect(r.detail).toContain('docker-compose.override.yml mounts ${LIC_DIR:')
    expect(r.detail).toContain('which doctor cannot read from this host')
    expect(r.detail).not.toContain('read ./opensteward-license/')
  })

  it("an unparseable docker-compose.override.yml is noted, and docker-compose.yml's ./opensteward-license/ is still read", () => {
    writeFileSync(join(root, 'docker-compose.yml'), COMPOSE)
    writeFileSync(join(root, 'docker-compose.override.yml'), 'services: [unclosed\n')
    putKey('opensteward-license', mint())
    const r = state(run())
    expect(r.status).toBe('PASS')
    expect(r.detail).toContain('could not read docker-compose.override.yml')
    expect(r.detail).not.toContain('\n') // js-yaml's snippet stays out of the one-line detail
    expect(r.detail).toContain('from opensteward-license/license.key')
    expect(r.detail).toContain('read ./opensteward-license/, which docker-compose.yml mounts there')
  })

  it('compose points elsewhere but a source run would read the store directory: an INFO row says so', () => {
    writeFileSync(join(root, 'docker-compose.yml'), COMPOSE)
    writeFileSync(dataKey(), mint())
    const rs = run()
    expect(state(rs).status).toBe('WARN')
    expect(state(rs).detail).toMatch(/^MISSING/)
    const info = rs.find((x) => x.name === 'license: source run')
    expect(info?.status).toBe('INFO')
    expect(info?.detail).toContain('apps/integration-server/data/license.key exists')
    expect(info?.detail).toContain('pnpm run dev')
    expect(info?.detail).toContain('/etc/opensteward/license/license.key')
  })

  it('no source-run row when OPENSTEWARD_LICENSE_FILE is set explicitly', () => {
    writeFileSync(join(root, 'docker-compose.yml'), COMPOSE)
    writeFileSync(dataKey(), mint())
    const rs = run({ OPENSTEWARD_LICENSE_FILE: '/srv/elsewhere/license.key' })
    expect(rs.find((x) => x.name === 'license: source run')).toBeUndefined()
  })

  it('a configured file that exists on this host is read', () => {
    mkdirSync(join(root, 'secrets'))
    writeFileSync(join(root, 'secrets/opensteward.key'), mint())
    expect(
      state(run({ OPENSTEWARD_LICENSE_FILE: join(root, 'secrets/opensteward.key') })).status,
    ).toBe('PASS')
  })

  it("a relative OPENSTEWARD_LICENSE_FILE resolves from apps/integration-server, the server's working directory", () => {
    mkdirSync(join(root, 'apps/integration-server/keys'))
    writeFileSync(join(root, 'apps/integration-server/keys/license.key'), mint())
    const r = state(run({ OPENSTEWARD_LICENSE_FILE: './keys/license.key' }))
    expect(r.status).toBe('PASS')
    expect(r.detail).toContain('from apps/integration-server/keys/license.key')
  })

  it('a configured path this host cannot see is reported, not guessed', () => {
    const r = state(run({ OPENSTEWARD_LICENSE_FILE: '/srv/elsewhere/license.key' }))
    expect(r.status).toBe('WARN')
    expect(r.detail).toMatch(/^MISSING/)
    expect(r.detail).toContain('does not exist on this host')
  })

  it.each([
    ['the whole token', (t: string) => t],
    ['the token without its v4.public. prefix', (t: string) => t.slice('v4.public.'.length)],
    // A path prefix in front of the token: the value as a whole is not a token, its file name is.
    ['the token behind ./', (t: string) => `./${t}`],
    [
      'the token as a file name in the container folder',
      (t: string) => `/etc/opensteward/license/${t}`,
    ],
    [
      'the token, without its prefix, in a folder',
      (t: string) => `secrets/${t.slice('v4.public.'.length)}`,
    ],
  ])(
    'a license token pasted into OPENSTEWARD_LICENSE_FILE (%s) is never printed',
    (_case, paste) => {
      const token = mint()
      const body = token.split('.')[2]!
      // the file variable alone: nothing to read
      const alone = run({ OPENSTEWARD_LICENSE_FILE: paste(token) })
      expect(state(alone).status).toBe('WARN')
      expect(state(alone).detail).toContain(
        'OPENSTEWARD_LICENSE_FILE holds a license token, not a path: put it in OPENSTEWARD_LICENSE instead',
      )
      expect(state(alone).detail).toContain('community mode')
      // next to a working OPENSTEWARD_LICENSE: still said, still not printed
      const both = run({ OPENSTEWARD_LICENSE: mint(), OPENSTEWARD_LICENSE_FILE: paste(token) })
      expect(state(both).status).toBe('PASS')
      expect(state(both).detail).toContain('OPENSTEWARD_LICENSE_FILE holds a license token')
      for (const rs of [alone, both]) {
        for (const chunk of [body.slice(0, 24), body.slice(-24)]) {
          expect(JSON.stringify(rs)).not.toContain(chunk)
        }
      }
    },
  )

  it('./opensteward-license/license.key that nothing points at gets its own INFO row', () => {
    putKey('opensteward-license', mint())
    const rs = run()
    expect(state(rs).status).toBe('WARN') // integration-server would not read it: MISSING
    expect(state(rs).detail).toMatch(/^MISSING/)
    expect(row(rs, 'license: file')).toEqual({
      name: 'license: file',
      status: 'INFO',
      detail:
        './opensteward-license/license.key exists, but nothing points integration-server at it: set OPENSTEWARD_LICENSE_FILE, or mount ./opensteward-license at /etc/opensteward/license as docker-compose.yml does',
    })
  })

  it('./license/ is not the license folder: a key there is neither read nor reported', () => {
    // ./license collides with the LICENSE file on macOS and Windows, so compose never mounts it.
    writeFileSync(join(root, 'docker-compose.yml'), COMPOSE)
    putKey('license', mint())
    const rs = run()
    expect(state(rs).detail).toMatch(/^MISSING/)
    expect(state(rs).detail).toContain('looked for opensteward-license/license.key')
    expect(row(rs, 'license: file')).toBeUndefined()
  })

  describe('a mounted file the container user (uid 1000) cannot read', () => {
    // The fixtures belong to the user running the tests. Run as uid 1000, that owner IS the
    // container user, so a mode-600 file is readable to it; Windows has no mode bits.
    const ownerIsContainerUser = process.platform === 'win32' || process.getuid?.() === 1000
    const chmodCommand =
      'run chmod 755 opensteward-license && chmod 644 opensteward-license/license.key'
    // A Linux host: Docker there enforces the mode bits on a bind mount as uid 1000 sees them.
    const onLinux = (env: NodeJS.ProcessEnv = {}) => run(env, { platform: 'linux' })

    it.skipIf(ownerIsContainerUser)(
      'a mode-600 license.key is a WARN naming the chmod commands',
      () => {
        writeFileSync(join(root, 'docker-compose.yml'), COMPOSE)
        chmodSync(putKey('opensteward-license', mint()), 0o600)
        const rs = onLinux()
        expect(state(rs).status).toBe('PASS') // doctor reads as its own user, so it can read it
        const perm = row(rs, 'license: permissions')
        expect(perm?.status).toBe('WARN')
        expect(perm?.detail).toContain(
          'integration-server reads opensteward-license/license.key as uid 1000 through a read-only bind mount, and the file is not readable by that uid',
        )
        expect(perm?.detail).toContain('INVALID (FILE_UNREADABLE)')
        expect(perm?.detail).toContain(chmodCommand)
      },
    )

    it.skipIf(ownerIsContainerUser)('a mode-700 folder is a WARN naming the chmod commands', () => {
      writeFileSync(join(root, 'docker-compose.yml'), COMPOSE)
      putKey('opensteward-license', mint())
      chmodSync(join(root, 'opensteward-license'), 0o700)
      const perm = row(onLinux(), 'license: permissions')
      expect(perm?.status).toBe('WARN')
      expect(perm?.detail).toContain('its folder is not searchable by that uid')
      expect(perm?.detail).not.toContain('the file is not readable')
      expect(perm?.detail).toContain(chmodCommand)
    })

    it.skipIf(ownerIsContainerUser).each(['darwin', 'win32'] as const)(
      'on a %s host (Docker Desktop maps bind-mount access to the host user) mode bits give no row',
      (platform) => {
        writeFileSync(join(root, 'docker-compose.yml'), COMPOSE)
        chmodSync(putKey('opensteward-license', mint()), 0o600)
        chmodSync(join(root, 'opensteward-license'), 0o700)
        const rs = run({}, { platform })
        expect(state(rs).status).toBe('PASS')
        expect(row(rs, 'license: permissions')).toBeUndefined()
      },
    )

    it.skipIf(ownerIsContainerUser)(
      'a mode-711 folder (searchable, not listable) gives no row: the file still opens',
      () => {
        writeFileSync(join(root, 'docker-compose.yml'), COMPOSE)
        chmodSync(putKey('opensteward-license', mint()), 0o644)
        chmodSync(join(root, 'opensteward-license'), 0o711)
        expect(row(onLinux(), 'license: permissions')).toBeUndefined()
      },
    )

    it('the modes A3.5 tells operators to set (755 and 644) give no row', () => {
      writeFileSync(join(root, 'docker-compose.yml'), COMPOSE)
      chmodSync(putKey('opensteward-license', mint()), 0o644)
      chmodSync(join(root, 'opensteward-license'), 0o755)
      const rs = onLinux()
      expect(state(rs).status).toBe('PASS')
      expect(row(rs, 'license: permissions')).toBeUndefined()
    })

    it('a file read straight from the host (no mount) is not checked: a source run reads it as you', () => {
      chmodSync(putKey('secrets', mint()), 0o600)
      const rs = onLinux({ OPENSTEWARD_LICENSE_FILE: join(root, 'secrets/license.key') })
      expect(state(rs).status).toBe('PASS')
      expect(row(rs, 'license: permissions')).toBeUndefined()
    })

    it('a shadowing environment token makes the file irrelevant: no row', () => {
      writeFileSync(join(root, 'docker-compose.yml'), COMPOSE)
      chmodSync(putKey('opensteward-license', mint()), 0o600)
      const rs = onLinux({ OPENSTEWARD_LICENSE: mint() })
      expect(row(rs, 'license: source')?.status).toBe('WARN')
      expect(row(rs, 'license: permissions')).toBeUndefined()
    })
  })

  it('reads OPENSTEWARD_LICENSE from .env', () => {
    writeFileSync(join(root, '.env'), `OPENSTEWARD_LICENSE=${mint()}\n`)
    expect(state(run()).status).toBe('PASS')
  })

  it('reads OPENSTEWARD_LICENSE_FILE from .env', () => {
    mkdirSync(join(root, 'secrets'))
    writeFileSync(join(root, 'secrets/opensteward.key'), mint())
    writeFileSync(
      join(root, '.env'),
      `OPENSTEWARD_LICENSE_FILE=${join(root, 'secrets/opensteward.key')}\n`,
    )
    const r = state(run())
    expect(r.status).toBe('PASS')
    expect(r.detail).toContain('from secrets/opensteward.key')
  })

  it('every license row doctor can print is named in the license guide', () => {
    // The guide's `pnpm run doctor` list is what operators read: a renamed or new row
    // must reach docs/deployment/license.md.
    const src = readFileSync(join(__dirname, '../../src/scripts/doctor.ts'), 'utf8')
    const names = [...new Set([...src.matchAll(/name: '(license: [^']+)'/g)].map((m) => m[1]!))]
    expect(names.sort()).toEqual([
      'license: file',
      'license: permissions',
      'license: source',
      'license: source run',
      'license: state',
    ])
    const guide = readFileSync(join(__dirname, '../../../../docs/deployment/license.md'), 'utf8')
    expect(names.filter((n) => !guide.includes(`\`${n}\``))).toEqual([])
  })

  it('WARN, never FAIL, without a license: community mode and the signup URL', () => {
    const rs = run()
    const r = state(rs)
    expect(r.status).toBe('WARN')
    expect(r.detail).toMatch(/^MISSING/)
    expect(r.detail).toContain('community mode')
    expect(r.detail).toContain('https://opensteward.dev/license')
    expect(rs).toHaveLength(1)
  })

  it('WARN on a tampered token', () => {
    const t = mint()
    const bad = t.slice(0, 20) + (t[20] === 'A' ? 'B' : 'A') + t.slice(21)
    const r = state(run({ OPENSTEWARD_LICENSE: bad }))
    expect(r.status).toBe('WARN')
    expect(r.detail).toMatch(/^INVALID/)
  })

  it('WARN in the grace period', () => {
    const t = mint({
      iat: '2025-09-29T12:00:00Z',
      nbf: '2025-09-29T12:00:00Z',
      exp: '2026-09-29T12:00:00Z',
    })
    const r = state(run({ OPENSTEWARD_LICENSE: t }))
    expect(r.status).toBe('WARN')
    expect(r.detail).toMatch(/^GRACE/)
  })

  it('WARN while EXPIRING, with the renewal URL', () => {
    const t = mint({ exp: '2026-10-20T12:00:00Z' })
    const r = state(run({ OPENSTEWARD_LICENSE: t }))
    expect(r.status).toBe('WARN')
    expect(r.detail).toMatch(/^EXPIRING/)
    expect(r.detail).toContain('https://opensteward.dev/license')
  })

  it('WARN for a key that is not a production key, even when the token claims env "prod"', () => {
    const r = state(run({ OPENSTEWARD_LICENSE: mint({}, 'other1') }))
    expect(r.status).toBe('WARN')
    expect(r.detail).toMatch(/^VALID/)
    expect(r.detail).toContain('other1')
    expect(r.detail).toContain('not a production signing key')
  })

  it('an environment token that shadows a license file is called out, naming both', () => {
    writeFileSync(dataKey(), mint())
    const rs = run({ OPENSTEWARD_LICENSE: mint({ org: 'Env Org AB' }) })
    expect(state(rs).status).toBe('PASS')
    expect(state(rs).detail).toContain('Env Org AB')
    const shadow = rs.find((r) => r.name === 'license: source')
    expect(shadow?.status).toBe('WARN')
    expect(shadow?.detail).toContain('OPENSTEWARD_LICENSE is set')
    expect(shadow?.detail).toContain('apps/integration-server/data/license.key')
  })

  it('no shadowing row when the environment token has no file behind it', () => {
    const rs = run({ OPENSTEWARD_LICENSE: mint() })
    expect(rs.find((r) => r.name === 'license: source')).toBeUndefined()
  })

  it("without the test seam, verifies with the build's own key ring: a foreign key is INVALID", () => {
    const r = state(run({ OPENSTEWARD_LICENSE: mint() }, { licenseKeyring: undefined }))
    expect(r.status).toBe('WARN')
    expect(r.detail).toMatch(/^INVALID/)
  })

  it('an evaluation error is one WARN row, never a crash of the whole doctor run', () => {
    const rs = run(
      {},
      {
        now: () => {
          throw new Error('clock exploded')
        },
      },
    )
    expect(rs).toEqual([
      { name: 'license: state', status: 'WARN', detail: 'could not evaluate: clock exploded' },
    ])
  })
})

describe('runDoctor end-to-end', () => {
  let root: string

  beforeEach(() => {
    root = tmp()
    mkdirSync(join(root, 'apps/admin-api/config'), { recursive: true })
    mkdirSync(join(root, 'apps/integration-server/data'), { recursive: true })
    writeFileSync(
      join(root, 'apps/admin-api/config/config.example.yml'),
      'server:\n  port: 3001\n',
    )
    writeFileSync(
      join(root, 'apps/admin-api/config/config.yml'),
      'server:\n  port: 3001\n',
    )
    writeFileSync(
      join(root, 'docker-compose.yml'),
      'services:\n  admin:\n    image: x\nvolumes:\n  admin-data:\n',
    )
    writeEnvExample(root)
  })
  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('exits 0 when every check is PASS or WARN', async () => {
    writeEnvFile(
      root,
      [
        `STORE_SECRET=${STRONG_STORE_SECRET}`,
        `JWT_SECRET=${STRONG_JWT_SECRET}`,
        `SESSION_SECRET=${STRONG_SESSION_SECRET}`,
        `ADMIN_SECRET=${STRONG_ADMIN_SECRET}`,
        `NODE_ENV=production`,
        `PORT=3000`,
      ].join('\n'),
    )
    const dbPath = join(root, 'apps/integration-server/data/credentials.db')
    await makeIntegrationDb(dbPath, STRONG_STORE_SECRET)
    const TEN_GIB_KB = 10 * 1024 * 1024
    const execShim = (cmd: string): string => {
      if (cmd.startsWith('docker volume inspect')) return '/tmp/fake-mount\n'
      if (cmd.startsWith('df -k')) {
        return `Filesystem 1024-blocks Used Available Capacity Mounted-on\n/dev/x ${TEN_GIB_KB * 2} ${TEN_GIB_KB} ${TEN_GIB_KB} 50% /\n`
      }
      throw new Error(`unexpected cmd: ${cmd}`)
    }
    const report = runDoctor({
      repoRoot: root,
      env: strongEnv(),
      storeSecret: STRONG_STORE_SECRET,
      execShim,
      gitDiffShim: () => false,
    })
    expect(report.exitCode).toBe(0)
    expect(report.results.some((r) => r.status === 'FAIL')).toBe(false)
    // No license: WARN, never FAIL — a license never blocks a boot.
    expect(report.results.find((r) => r.name === 'license: state')?.status).toBe('WARN')
  })

  it('exits 1 when any check FAILs (bad STORE_SECRET against real data)', async () => {
    const dbPath = join(root, 'apps/integration-server/data/credentials.db')
    await makeIntegrationDb(dbPath, STRONG_STORE_SECRET)
    const report = runDoctor({
      repoRoot: root,
      env: {
        ...strongEnv(),
        STORE_SECRET: 'wrong-but-still-passes-length-check-xyzaaa',
      },
      storeSecret: 'wrong-but-still-passes-length-check-xyzaaa',
      execShim: () => '/tmp\n',
      gitDiffShim: () => false,
    })
    expect(report.exitCode).toBe(1)
    expect(report.results.some((r) => r.status === 'FAIL')).toBe(true)
  })

  it('exits 1 when a required env var is missing — independent of other checks', () => {
    const env = strongEnv()
    delete env.JWT_SECRET
    const report = runDoctor({
      repoRoot: root,
      env,
      storeSecret: STRONG_STORE_SECRET,
      execShim: () => '/tmp\n',
      gitDiffShim: () => false,
    })
    expect(report.exitCode).toBe(1)
    const row = report.results.find((r) => r.name === 'env: JWT_SECRET')
    expect(row?.status).toBe('FAIL')
  })

  it('renderReport produces a tabular output ending in an exit-code summary', () => {
    const report = runDoctor({
      repoRoot: root,
      env: strongEnv(),
      storeSecret: STRONG_STORE_SECRET,
      execShim: () => '/tmp\n',
      gitDiffShim: () => false,
    })
    const rendered = renderReport(report)
    expect(rendered).toContain('Check')
    expect(rendered).toContain('Status')
    expect(rendered).toContain('Detail')
    expect(rendered).toMatch(/exit \d/)
  })
})
