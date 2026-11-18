import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import * as tar from 'tar'
import Database from 'better-sqlite3'
import {
  parseArgs,
  readVolumeNames,
  runBackup,
  VolumeNotCreatedError,
  type Manifest,
} from '../../src/scripts/backup'
import { applyMigrations } from '../../src/sqlite/migrate'

/**
 * Build a throwaway repo-root layout: docker-compose.yml with three named
 * volumes + an .env + a couple of config files. The actual volume host
 * dirs live under `volumesBase/<name>` and the test passes that through
 * the script's `--volumes-base` test-only flag so no docker daemon is
 * needed.
 */
function makeFixture(): {
  dir: string
  cleanup: () => void
} {
  const dir = mkdtempSync(join(tmpdir(), 'backup-fixture-'))
  writeFileSync(
    join(dir, 'docker-compose.yml'),
    [
      'services:',
      '  admin-api:',
      '    image: admin-api',
      '    volumes:',
      '      - admin-data:/data',
      'volumes:',
      '  admin-data:',
      '  webhook-data:',
      '  integration-server-data:',
      '',
    ].join('\n'),
  )
  writeFileSync(join(dir, '.env'), 'STORE_SECRET=secret-from-env\n')
  mkdirSync(join(dir, 'apps/admin/config'), { recursive: true })
  writeFileSync(join(dir, 'apps/admin/config/config.yml'), 'server:\n  port: 3000\n')
  mkdirSync(join(dir, 'apps/admin-api/config'), { recursive: true })
  writeFileSync(join(dir, 'apps/admin-api/config/config.yml'), 'auth:\n  jwt: secret\n')
  // Pre-create the volumes-base so the path discovery is deterministic.
  const volumesBase = join(dir, 'volumes-base')
  for (const v of ['admin-data', 'webhook-data', 'integration-server-data']) {
    mkdirSync(join(volumesBase, v), { recursive: true })
  }
  return {
    dir,
    cleanup: () => {
      try {
        rmSync(dir, { recursive: true, force: true })
      } catch {
        /* best effort */
      }
    },
  }
}

/**
 * Drop a sqlite db at `<volumesBase>/<volume>/<file>` with a
 * `_schema_migrations` row applied via the real `applyMigrations` so the
 * manifest's schemaVersions assertion exercises the same path as the
 * runtime stores.
 */
function seedDb(path: string, namespace: string, version: number): void {
  mkdirSync(join(path, '..'), { recursive: true })
  const db = new Database(path)
  try {
    const migrations = Array.from({ length: version }, (_, i) => ({
      version: i + 1,
      sql: `CREATE TABLE IF NOT EXISTS dummy_${namespace}_${i + 1} (id INTEGER)`,
    }))
    applyMigrations(db, namespace, migrations)
  } finally {
    db.close()
  }
}

describe('readVolumeNames', () => {
  it('parses the top-level volumes block from docker-compose.yml', () => {
    const { dir, cleanup } = makeFixture()
    try {
      const names = readVolumeNames(join(dir, 'docker-compose.yml'))
      expect(names).toEqual(['admin-data', 'webhook-data', 'integration-server-data'])
    } finally {
      cleanup()
    }
  })

  it('returns an empty list when no volumes block is present', () => {
    const dir = mkdtempSync(join(tmpdir(), 'compose-empty-'))
    try {
      writeFileSync(join(dir, 'docker-compose.yml'), 'services:\n  x:\n    image: y\n')
      expect(readVolumeNames(join(dir, 'docker-compose.yml'))).toEqual([])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('runBackup', () => {
  let fix: ReturnType<typeof makeFixture>
  beforeEach(() => {
    fix = makeFixture()
  })
  afterEach(() => fix.cleanup())

  it('writes a tarball with the expected layout and a populated manifest', async () => {
    // Put some content inside each volume so we can assert it lands in
    // the tarball under `volumes/<name>/...`.
    writeFileSync(join(fix.dir, 'volumes-base/admin-data/notes.txt'), 'hello-admin')
    writeFileSync(join(fix.dir, 'volumes-base/webhook-data/notes.txt'), 'hello-webhook')
    // Real db with a migration applied so manifest.schemaVersions has a
    // verifiable entry.
    seedDb(join(fix.dir, 'volumes-base/admin-data/admin.db'), 'admin_things', 2)

    const result = await runBackup({
      repoRoot: fix.dir,
      outDir: join(fix.dir, 'backups'),
      volumesBase: join(fix.dir, 'volumes-base'),
      unsafeAllowLiveDb: true,
      // /version probes would block the test on a 1.5s timeout each —
      // short-circuit instead.
      serviceVersionsOverride: { 'admin-api': '1.4.0' },
    })

    expect(existsSync(result.tarballPath)).toBe(true)
    expect(result.manifest.volumes).toEqual([
      'admin-data',
      'webhook-data',
      'integration-server-data',
    ])
    expect(result.manifest.envIncluded).toBe(true)
    expect(result.manifest.configFiles).toEqual(
      expect.arrayContaining(['apps/admin/config/config.yml', 'apps/admin-api/config/config.yml']),
    )
    expect(result.manifest.tooling).toEqual({
      tool: 'opensteward-backup',
      toolVersion: expect.any(String),
      format: 1,
    })
    expect(result.manifest.serviceVersions).toEqual({ 'admin-api': '1.4.0' })
    // schemaVersions records the namespace + version we applied.
    expect(result.manifest.schemaVersions).toMatchObject({
      'volumes/admin-data/admin.db': { admin_things: 2 },
    })

    // Extract the tarball into a sibling dir and assert structure.
    const extractDir = join(fix.dir, 'extract')
    mkdirSync(extractDir, { recursive: true })
    await tar.extract({ file: result.tarballPath, cwd: extractDir })

    expect(existsSync(join(extractDir, 'MANIFEST.json'))).toBe(true)
    const manifestOnDisk = JSON.parse(
      readFileSync(join(extractDir, 'MANIFEST.json'), 'utf8'),
    ) as Manifest
    expect(manifestOnDisk.tooling.format).toBe(1)
    expect(existsSync(join(extractDir, '.env'))).toBe(true)
    expect(existsSync(join(extractDir, 'apps/admin/config/config.yml'))).toBe(true)
    expect(existsSync(join(extractDir, 'volumes/admin-data/notes.txt'))).toBe(true)
    expect(readFileSync(join(extractDir, 'volumes/admin-data/notes.txt'), 'utf8')).toBe(
      'hello-admin',
    )
    expect(existsSync(join(extractDir, 'volumes/webhook-data/notes.txt'))).toBe(true)
  })

  it('refuses to run when a fresh -wal sibling is detected next to a volume db', async () => {
    // Seed a db then drop a -wal next to it with a "now" mtime.
    const dbPath = join(fix.dir, 'volumes-base/admin-data/admin.db')
    seedDb(dbPath, 'admin_things', 1)
    writeFileSync(`${dbPath}-wal`, '')
    const now = new Date()
    utimesSync(`${dbPath}-wal`, now, now)

    await expect(
      runBackup({
        repoRoot: fix.dir,
        outDir: join(fix.dir, 'backups'),
        volumesBase: join(fix.dir, 'volumes-base'),
        serviceVersionsOverride: {},
      }),
    ).rejects.toThrow(/writer is still attached/)
  })

  it('records "unknown" for services whose /version probe fails', async () => {
    // Let the real probe run, but force every /version fetch to fail so the
    // test is deterministic regardless of what happens to be listening on the
    // host's loopback ports (e.g. a locally-running dev stack). Connection
    // failures are exactly what we want to exercise here.
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'))
    try {
      const result = await runBackup({
        repoRoot: fix.dir,
        outDir: join(fix.dir, 'backups'),
        volumesBase: join(fix.dir, 'volumes-base'),
        unsafeAllowLiveDb: true,
      })
      // Every probe failed → every recorded version is the "unknown" sentinel.
      // This is the load-bearing assertion: backup still produces a manifest
      // even when the /version endpoint isn't deployed/reachable.
      const values = Object.values(result.manifest.serviceVersions)
      expect(values.length).toBeGreaterThan(0)
      for (const v of values) expect(v).toBe('unknown')
    } finally {
      fetchSpy.mockRestore()
    }
  }, 15_000)

  it('omits config files that do not exist on disk', async () => {
    // Don't create webhook-gateway or integration-server configs — the
    // manifest should only list the two configs we did create.
    const result = await runBackup({
      repoRoot: fix.dir,
      outDir: join(fix.dir, 'backups'),
      volumesBase: join(fix.dir, 'volumes-base'),
      unsafeAllowLiveDb: true,
      serviceVersionsOverride: {},
    })
    expect(result.manifest.configFiles).toEqual([
      'apps/admin/config/config.yml',
      'apps/admin-api/config/config.yml',
    ])
  })

  it('throws a helpful error when docker-compose.yml is missing', async () => {
    const empty = mkdtempSync(join(tmpdir(), 'no-compose-'))
    try {
      await expect(
        runBackup({
          repoRoot: empty,
          outDir: join(empty, 'backups'),
          volumesBase: join(empty, 'volumes-base'),
          serviceVersionsOverride: {},
          unsafeAllowLiveDb: true,
        }),
      ).rejects.toThrow(/docker-compose\.yml not found/)
    } finally {
      rmSync(empty, { recursive: true, force: true })
    }
  })

  // A volume behind a profile that never ran (`postgres-data` without the
  // analytics profile) has never been created. It used to stop the whole
  // backup with "Failed to resolve docker volume"; it holds nothing, so it is
  // skipped and recorded instead.
  it('skips a volume docker has never created and records it in the manifest', async () => {
    const resolveVolume = (name: string): string => {
      if (name === 'webhook-data') throw new VolumeNotCreatedError(`proj_${name}`)
      return join(fix.dir, 'volumes-base', name)
    }
    const result = await runBackup(
      {
        repoRoot: fix.dir,
        outDir: join(fix.dir, 'backups'),
        unsafeAllowLiveDb: true,
        serviceVersionsOverride: {},
      },
      { resolveVolume },
    )
    expect(result.manifest.volumes).toEqual(['admin-data', 'integration-server-data'])
    expect(result.manifest.skippedVolumes).toEqual(['webhook-data'])
  })

  it('still fails on any other volume error, and when no volume exists at all', async () => {
    const dockerDown = (): string => {
      throw new Error('Cannot connect to the Docker daemon')
    }
    await expect(
      runBackup(
        {
          repoRoot: fix.dir,
          outDir: join(fix.dir, 'backups'),
          unsafeAllowLiveDb: true,
          serviceVersionsOverride: {},
        },
        { resolveVolume: dockerDown },
      ),
    ).rejects.toThrow(/Docker daemon/)
    const noneCreated = (name: string): string => {
      throw new VolumeNotCreatedError(`proj_${name}`)
    }
    await expect(
      runBackup(
        {
          repoRoot: fix.dir,
          outDir: join(fix.dir, 'backups'),
          unsafeAllowLiveDb: true,
          serviceVersionsOverride: {},
        },
        { resolveVolume: noneCreated },
      ),
    ).rejects.toThrow(/None of the volumes/)
  })

  it('writes the tarball under <outDir>/opensteward-<ts>.tar.gz', async () => {
    const result = await runBackup({
      repoRoot: fix.dir,
      outDir: join(fix.dir, 'backups'),
      timestamp: '2026-01-15T12-30-00-000Z',
      volumesBase: join(fix.dir, 'volumes-base'),
      unsafeAllowLiveDb: true,
      serviceVersionsOverride: {},
    })
    const files = readdirSync(join(fix.dir, 'backups'))
    expect(files).toContain('opensteward-2026-01-15T12-30-00-000Z.tar.gz')
    expect(result.tarballPath).toContain('opensteward-2026-01-15T12-30-00-000Z.tar.gz')
  })
})

describe('parseArgs', () => {
  it('defaults repoRoot to cwd and outDir to cwd/backups', () => {
    const args = parseArgs([])
    expect(args.repoRoot).toBe(process.cwd())
    expect(args.outDir).toBe(join(process.cwd(), 'backups'))
  })

  it('extracts --repo-root and re-anchors --out-dir under it', () => {
    const args = parseArgs(['--repo-root', '/tmp/repo'])
    expect(args.repoRoot).toBe('/tmp/repo')
    expect(args.outDir).toBe('/tmp/repo/backups')
  })

  it('honours an explicit --out-dir', () => {
    const args = parseArgs(['--repo-root', '/tmp/repo', '--out-dir', '/tmp/backups'])
    expect(args.outDir).toBe('/tmp/backups')
  })

  it('threads --volumes-base and --unsafe-allow-live-db', () => {
    const args = parseArgs(['--volumes-base', '/tmp/v', '--unsafe-allow-live-db'])
    expect(args.volumesBase).toBe('/tmp/v')
    expect(args.unsafeAllowLiveDb).toBe(true)
  })

  it('throws on unknown args', () => {
    expect(() => parseArgs(['--bogus'])).toThrow(/unknown argument/)
  })
})
