import { describe, it, expect, beforeEach, afterEach } from 'vitest'
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
import Database from 'better-sqlite3'
import { runBackup } from '../../src/scripts/backup'
import { parseArgs, runRestore } from '../../src/scripts/restore'
import { applyMigrations } from '../../src/sqlite/migrate'

/**
 * Same repo-root fixture as the backup tests. Two volume host dirs are
 * pre-created under `volumes-base/<name>` so `--volumes-base` resolves
 * deterministically. Each test seeds whatever it needs before running.
 */
function makeFixture(): {
  dir: string
  cleanup: () => void
} {
  const dir = mkdtempSync(join(tmpdir(), 'restore-fixture-'))
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

describe('runRestore — round trip', () => {
  let fix: ReturnType<typeof makeFixture>
  beforeEach(() => {
    fix = makeFixture()
  })
  afterEach(() => fix.cleanup())

  it('restores volume contents byte-for-byte after a backup → wipe → restore cycle', async () => {
    // 1. Seed volumes with some content.
    writeFileSync(join(fix.dir, 'volumes-base/admin-data/notes.txt'), 'pre-backup-admin')
    writeFileSync(
      join(fix.dir, 'volumes-base/webhook-data/notes.txt'),
      'pre-backup-webhook',
    )
    seedDb(join(fix.dir, 'volumes-base/admin-data/admin.db'), 'restore_ns', 1)
    const originalDbBytes = readFileSync(join(fix.dir, 'volumes-base/admin-data/admin.db'))

    // 2. Backup.
    const backupResult = await runBackup({
      repoRoot: fix.dir,
      outDir: join(fix.dir, 'backups'),
      volumesBase: join(fix.dir, 'volumes-base'),
      unsafeAllowLiveDb: true,
      serviceVersionsOverride: { 'admin-api': '1.4.0' },
    })

    // 3. Blow the volumes away — simulate a wiped install.
    for (const v of ['admin-data', 'webhook-data', 'integration-server-data']) {
      rmSync(join(fix.dir, 'volumes-base', v), { recursive: true, force: true })
      mkdirSync(join(fix.dir, 'volumes-base', v), { recursive: true })
    }
    expect(readdirSync(join(fix.dir, 'volumes-base/admin-data'))).toEqual([])

    // 4. Restore.
    const restoreResult = await runRestore({
      tarballPath: backupResult.tarballPath,
      repoRoot: fix.dir,
      volumesBase: join(fix.dir, 'volumes-base'),
      unsafeAllowLiveDb: true,
    })

    expect(restoreResult.volumesRestored.sort()).toEqual(
      ['admin-data', 'integration-server-data', 'webhook-data'].sort(),
    )
    expect(restoreResult.manifest.tooling.tool).toBe('opensteward-backup')

    // 5. Contents are back.
    expect(
      readFileSync(join(fix.dir, 'volumes-base/admin-data/notes.txt'), 'utf8'),
    ).toBe('pre-backup-admin')
    expect(
      readFileSync(join(fix.dir, 'volumes-base/webhook-data/notes.txt'), 'utf8'),
    ).toBe('pre-backup-webhook')
    const restoredDb = readFileSync(join(fix.dir, 'volumes-base/admin-data/admin.db'))
    expect(restoredDb.equals(originalDbBytes)).toBe(true)
  })

  it('refuses to overwrite .env without --force', async () => {
    // Backup with an .env present, then attempt restore against a repo
    // that ALSO has an .env — should refuse without --force.
    writeFileSync(join(fix.dir, '.env'), 'STORE_SECRET=original\n')
    const result = await runBackup({
      repoRoot: fix.dir,
      outDir: join(fix.dir, 'backups'),
      volumesBase: join(fix.dir, 'volumes-base'),
      unsafeAllowLiveDb: true,
      serviceVersionsOverride: {},
    })
    // .env still exists in the repo — restore must refuse.
    expect(existsSync(join(fix.dir, '.env'))).toBe(true)
    await expect(
      runRestore({
        tarballPath: result.tarballPath,
        repoRoot: fix.dir,
        volumesBase: join(fix.dir, 'volumes-base'),
        unsafeAllowLiveDb: true,
      }),
    ).rejects.toThrow(/Refusing to overwrite/)
  })

  it('refuses to overwrite config files without --force', async () => {
    mkdirSync(join(fix.dir, 'apps/admin/config'), { recursive: true })
    writeFileSync(join(fix.dir, 'apps/admin/config/config.yml'), 'server:\n  port: 3000\n')
    const result = await runBackup({
      repoRoot: fix.dir,
      outDir: join(fix.dir, 'backups'),
      volumesBase: join(fix.dir, 'volumes-base'),
      unsafeAllowLiveDb: true,
      serviceVersionsOverride: {},
    })
    await expect(
      runRestore({
        tarballPath: result.tarballPath,
        repoRoot: fix.dir,
        volumesBase: join(fix.dir, 'volumes-base'),
        unsafeAllowLiveDb: true,
      }),
    ).rejects.toThrow(/Refusing to overwrite/)
  })

  it('overwrites .env and config files when --force is passed', async () => {
    writeFileSync(join(fix.dir, '.env'), 'STORE_SECRET=original-env\n')
    mkdirSync(join(fix.dir, 'apps/admin/config'), { recursive: true })
    writeFileSync(join(fix.dir, 'apps/admin/config/config.yml'), 'server:\n  port: 3000\n')
    const result = await runBackup({
      repoRoot: fix.dir,
      outDir: join(fix.dir, 'backups'),
      volumesBase: join(fix.dir, 'volumes-base'),
      unsafeAllowLiveDb: true,
      serviceVersionsOverride: {},
    })
    // Mutate the live files so we can prove they were overwritten.
    writeFileSync(join(fix.dir, '.env'), 'STORE_SECRET=mutated\n')
    writeFileSync(join(fix.dir, 'apps/admin/config/config.yml'), 'server:\n  port: 9999\n')

    const restoreResult = await runRestore({
      tarballPath: result.tarballPath,
      repoRoot: fix.dir,
      volumesBase: join(fix.dir, 'volumes-base'),
      unsafeAllowLiveDb: true,
      force: true,
    })

    expect(restoreResult.rootFilesRestored.sort()).toEqual(
      ['.env', 'apps/admin/config/config.yml'].sort(),
    )
    expect(readFileSync(join(fix.dir, '.env'), 'utf8')).toBe('STORE_SECRET=original-env\n')
    expect(readFileSync(join(fix.dir, 'apps/admin/config/config.yml'), 'utf8')).toBe(
      'server:\n  port: 3000\n',
    )
  })

  it('--manifest-only prints the manifest but does not touch volumes', async () => {
    writeFileSync(join(fix.dir, 'volumes-base/admin-data/notes.txt'), 'before-restore')
    const result = await runBackup({
      repoRoot: fix.dir,
      outDir: join(fix.dir, 'backups'),
      volumesBase: join(fix.dir, 'volumes-base'),
      unsafeAllowLiveDb: true,
      serviceVersionsOverride: { 'admin-api': '1.4.0' },
    })
    // Mutate the live volume — restore (--manifest-only) must leave the
    // mutated content alone.
    writeFileSync(join(fix.dir, 'volumes-base/admin-data/notes.txt'), 'mutated-after-backup')

    const restoreResult = await runRestore({
      tarballPath: result.tarballPath,
      repoRoot: fix.dir,
      volumesBase: join(fix.dir, 'volumes-base'),
      unsafeAllowLiveDb: true,
      manifestOnly: true,
    })

    expect(restoreResult.volumesRestored).toEqual([])
    expect(restoreResult.rootFilesRestored).toEqual([])
    expect(restoreResult.manifest.serviceVersions).toEqual({ 'admin-api': '1.4.0' })
    // Live content unchanged.
    expect(
      readFileSync(join(fix.dir, 'volumes-base/admin-data/notes.txt'), 'utf8'),
    ).toBe('mutated-after-backup')
  })

  it('refuses to run when a fresh -wal sibling is detected', async () => {
    writeFileSync(join(fix.dir, 'volumes-base/admin-data/notes.txt'), 'placeholder')
    const result = await runBackup({
      repoRoot: fix.dir,
      outDir: join(fix.dir, 'backups'),
      volumesBase: join(fix.dir, 'volumes-base'),
      unsafeAllowLiveDb: true,
      serviceVersionsOverride: {},
    })

    // Seed a db + drop a "now"-mtimed -wal next to it. Restore must
    // detect the live writer before touching anything.
    const dbPath = join(fix.dir, 'volumes-base/admin-data/admin.db')
    seedDb(dbPath, 'restore_guard', 1)
    writeFileSync(`${dbPath}-wal`, '')
    const now = new Date()
    utimesSync(`${dbPath}-wal`, now, now)

    await expect(
      runRestore({
        tarballPath: result.tarballPath,
        repoRoot: fix.dir,
        volumesBase: join(fix.dir, 'volumes-base'),
      }),
    ).rejects.toThrow(/writer is still attached/)
  })

  it('throws a clear error on a missing or malformed manifest', async () => {
    // Build a tarball that's structurally a tar but lacks a MANIFEST.json.
    const badTarball = join(fix.dir, 'bad.tar.gz')
    const stagingDir = mkdtempSync(join(tmpdir(), 'restore-bad-'))
    try {
      writeFileSync(join(stagingDir, 'not-a-manifest.txt'), 'whatever')
      // Use the tar package directly via dynamic import to avoid extra
      // top-level imports.
      const tar = await import('tar')
      await tar.create({ gzip: true, file: badTarball, cwd: stagingDir }, ['not-a-manifest.txt'])
    } finally {
      rmSync(stagingDir, { recursive: true, force: true })
    }

    await expect(
      runRestore({
        tarballPath: badTarball,
        repoRoot: fix.dir,
        volumesBase: join(fix.dir, 'volumes-base'),
        unsafeAllowLiveDb: true,
      }),
    ).rejects.toThrow(/MANIFEST\.json missing/)
  })

  it('throws when the tarball path does not exist', async () => {
    await expect(
      runRestore({
        tarballPath: join(fix.dir, 'no-such-file.tar.gz'),
        repoRoot: fix.dir,
        volumesBase: join(fix.dir, 'volumes-base'),
        unsafeAllowLiveDb: true,
      }),
    ).rejects.toThrow(/tarball not found/)
  })
})

describe('restore parseArgs', () => {
  it('extracts a positional tarball path', () => {
    const args = parseArgs(['backups/file.tar.gz'])
    expect(args.tarballPath).toBe('backups/file.tar.gz')
  })

  it('threads --force, --manifest-only, --repo-root, --volumes-base', () => {
    const args = parseArgs([
      'b.tar.gz',
      '--force',
      '--manifest-only',
      '--repo-root',
      '/tmp/repo',
      '--volumes-base',
      '/tmp/v',
    ])
    expect(args).toMatchObject({
      tarballPath: 'b.tar.gz',
      force: true,
      manifestOnly: true,
      repoRoot: '/tmp/repo',
      volumesBase: '/tmp/v',
    })
  })

  it('rejects two positional tarball paths', () => {
    expect(() => parseArgs(['a.tar.gz', 'b.tar.gz'])).toThrow(/more than one tarball/)
  })

  it('rejects unknown flags', () => {
    expect(() => parseArgs(['--bogus'])).toThrow(/unknown argument/)
  })
})
