#!/usr/bin/env node
/**
 * `backup` — one-shot offline snapshot of an OpenSteward deployment.
 *
 * Usage:
 *
 *   pnpm backup
 *
 * Produces `backups/opensteward-<ISO timestamp>.tar.gz` containing:
 *   - `volumes/<volname>/...`     — every named docker volume listed in
 *                                    `docker-compose.yml` at the repo root.
 *   - `.env` (if present)         — operator env file.
 *   - `apps/<svc>/config/config.yml` (each, if present)
 *   - `MANIFEST.json`             — see `Manifest` interface below.
 *
 * The tool is OFFLINE. Services must be stopped first. It refuses to run
 * if a fresh `-wal` / `-shm` sibling exists next to any db file inside
 * any volume mount path (same guard pattern as `rotate-store-secret.ts`).
 *
 * Volume host paths are discovered by:
 *   1. Parsing `docker-compose.yml` for the top-level `volumes:` block.
 *   2. Running `docker volume inspect <project>_<volname> --format ...`
 *      where `<project>` is the basename of the directory containing the
 *      compose file (which is how `docker compose` derives the project
 *      prefix unless `COMPOSE_PROJECT_NAME` is set — that env var is
 *      honoured here too).
 *
 * Test-only flag `--volumes-base <path>` short-circuits the docker call
 * and resolves each volume to `<base>/<volname>` instead. Documented as
 * test-only.
 */
import Database from 'better-sqlite3'
import { execFileSync } from 'child_process'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
  type Dirent,
} from 'fs'
import * as yaml from 'js-yaml'
import { basename, dirname, join, relative, resolve } from 'path'
import * as tar from 'tar'

const TOOL_VERSION = '0.1.0'
const MANIFEST_FORMAT_VERSION = 1

/** How recent a -wal/-shm file can be before we refuse to back up (ms). */
const WAL_FRESH_THRESHOLD_MS = 60_000

/**
 * Default ports we'll try when populating MANIFEST.serviceVersions. Each
 * `/version` request is best-effort; "unknown" is recorded on failure so
 * the manifest is still produced even when a service does not implement
 * /version or is down.
 */
const DEFAULT_VERSION_PROBES: Record<string, number> = {
  admin: 3000,
  'admin-api': 3001,
  'docs-server': 3003,
  'webhook-gateway': 3004,
  'integration-server': 3010,
}

export interface CliArgs {
  /** Repo root. Defaults to `process.cwd()`. */
  repoRoot: string
  /** Where to write the tarball. Defaults to `<repoRoot>/backups`. */
  outDir: string
  /** Optional fixed ISO timestamp — tests use this to make the filename predictable. */
  timestamp?: string
  /** Skip the WAL-freshness guard. For tests only. */
  unsafeAllowLiveDb?: boolean
  /**
   * Test-only override. When set, each volume is resolved to
   * `<volumesBase>/<volname>` instead of going through `docker volume
   * inspect`. Lets unit tests run without a docker daemon.
   */
  volumesBase?: string
  /**
   * Test-only override. When set, version probes are skipped entirely
   * and `serviceVersions` is recorded as the provided object verbatim.
   */
  serviceVersionsOverride?: Record<string, string>
}

export interface Manifest {
  createdAt: string
  gitSha: string
  serviceVersions: Record<string, string>
  schemaVersions: Record<string, Record<string, number>>
  volumes: string[]
  /** Volumes declared in docker-compose.yml that docker has never created —
   *  a profile (`https`, `analytics`) that has not run yet. Absent when none
   *  were skipped. Restore reads `volumes` only, so these are informational. */
  skippedVolumes?: string[]
  configFiles: string[]
  envIncluded: boolean
  tooling: {
    tool: 'opensteward-backup'
    toolVersion: string
    format: number
  }
}

export interface BackupResult {
  tarballPath: string
  manifest: Manifest
}

/**
 * The four config files we know about. Paths are repo-relative. We
 * include whichever exist on disk; missing files are simply skipped.
 *
 * Note: `apps/integration-server/config/config.yml` may not exist in a
 * stock checkout — docker-compose mounts `config.example.yml` directly.
 * That's fine — the file is included only when present, and the manifest
 * records which configs landed in the tarball.
 */
const CONFIG_FILES = [
  'apps/admin/config/config.yml',
  'apps/admin-api/config/config.yml',
  'apps/webhook-gateway/config/config.yml',
  'apps/integration-server/config/config.yml',
] as const

/**
 * A compose volume docker has never created. Compose creates a volume only
 * when a service that mounts it first starts, so a volume behind a profile
 * that has never run (`caddy-data` for `https`, `postgres-data` for
 * `analytics`) does not exist — there is nothing in it to back up.
 */
export class VolumeNotCreatedError extends Error {
  constructor(readonly dockerName: string) {
    super(
      `docker volume "${dockerName}" has not been created. ` +
        `Volumes are created on first \`docker compose up -d\` (a profile's volumes on its first up).`,
    )
    this.name = 'VolumeNotCreatedError'
  }
}

export interface BackupDeps {
  /** Resolves a compose volume to a host path. Tests replace it. */
  resolveVolume?: typeof resolveVolumeHostPath
}

/**
 * Run the backup end-to-end. Returns the tarball path + a copy of the
 * manifest written into it. Throws on any I/O or guard failure.
 */
export async function runBackup(args: CliArgs, deps: BackupDeps = {}): Promise<BackupResult> {
  const resolveVolume = deps.resolveVolume ?? resolveVolumeHostPath
  const repoRoot = resolve(args.repoRoot)
  const composeFile = join(repoRoot, 'docker-compose.yml')
  if (!existsSync(composeFile)) {
    throw new Error(
      `docker-compose.yml not found at ${composeFile}. ` +
        `Run pnpm backup from the repo root, or pass --repo-root <path>.`,
    )
  }

  const volumeNames = readVolumeNames(composeFile)
  if (volumeNames.length === 0) {
    throw new Error(
      `No named volumes found in ${composeFile}. ` + `Backup is a no-op without volume data.`,
    )
  }

  const projectName = resolveProjectName(repoRoot)
  // A volume no service has created yet holds nothing: skip it rather than
  // refuse the whole backup. Any other failure (docker not running, an
  // empty mountpoint) still stops the backup.
  const volumeMounts: Array<{ name: string; path: string }> = []
  const skippedVolumes: string[] = []
  for (const name of volumeNames) {
    try {
      volumeMounts.push({ name, path: resolveVolume(name, projectName, args.volumesBase) })
    } catch (err) {
      if (!(err instanceof VolumeNotCreatedError)) throw err
      skippedVolumes.push(name)
    }
  }
  if (volumeMounts.length === 0) {
    throw new Error(
      `None of the volumes in ${composeFile} exist yet (${skippedVolumes.join(', ')}). ` +
        `Run \`docker compose up -d\` at least once before backing up.`,
    )
  }

  // Guard: refuse if any db file inside any volume mount has a fresh
  // -wal / -shm sibling. That signals a live writer is attached.
  if (!args.unsafeAllowLiveDb) {
    for (const v of volumeMounts) {
      for (const dbFile of findDbFiles(v.path)) {
        assertNoLiveWriter(dbFile)
      }
    }
  }

  // Build the manifest.
  const createdAt = args.timestamp ?? new Date().toISOString()
  const manifest: Manifest = {
    createdAt,
    gitSha: tryGitSha(repoRoot),
    serviceVersions:
      args.serviceVersionsOverride ?? (await probeServiceVersions(DEFAULT_VERSION_PROBES)),
    schemaVersions: collectSchemaVersions(volumeMounts),
    volumes: volumeMounts.map((v) => v.name),
    ...(skippedVolumes.length > 0 ? { skippedVolumes } : {}),
    configFiles: [],
    envIncluded: false,
    tooling: {
      tool: 'opensteward-backup',
      toolVersion: TOOL_VERSION,
      format: MANIFEST_FORMAT_VERSION,
    },
  }

  // Decide which root files exist.
  const envPath = join(repoRoot, '.env')
  if (existsSync(envPath)) manifest.envIncluded = true
  const configsPresent = CONFIG_FILES.filter((rel) => existsSync(join(repoRoot, rel)))
  manifest.configFiles = [...configsPresent]

  // Make sure the output dir exists.
  const outDir = resolve(args.outDir)
  mkdirSync(outDir, { recursive: true })
  const tarballPath = join(outDir, `opensteward-${createdAt.replace(/[:.]/g, '-')}.tar.gz`)

  await writeTarball({
    tarballPath,
    repoRoot,
    volumeMounts,
    envIncluded: manifest.envIncluded,
    configsPresent: [...configsPresent],
    manifest,
  })

  return { tarballPath, manifest }
}

interface WriteTarballArgs {
  tarballPath: string
  repoRoot: string
  volumeMounts: Array<{ name: string; path: string }>
  envIncluded: boolean
  configsPresent: string[]
  manifest: Manifest
}

/**
 * Build the .tar.gz file. Files are arranged so the restore script can
 * reverse the layout deterministically:
 *
 *   /MANIFEST.json
 *   /.env                       (optional)
 *   /apps/<svc>/config/config.yml  (each that existed)
 *   /volumes/<volname>/...       (everything under the host mount path)
 *
 * Implementation note: we collect every individual file into a temp
 * staging tree under a single root, then call `tar.create` once. This
 * is simpler than streaming entries from multiple roots and is fine for
 * backup-scale data (encrypted stores are admin-scale).
 */
async function writeTarball(args: WriteTarballArgs): Promise<void> {
  const { tarballPath, repoRoot, volumeMounts, envIncluded, configsPresent, manifest } = args

  // Stage into a sibling temp dir so the on-disk layout matches the
  // tarball layout 1:1. We use a sibling of the output dir (which we
  // already created) to keep cleanup simple.
  const stagingRoot = `${tarballPath}.staging`
  if (existsSync(stagingRoot)) {
    // Defensive: a prior failed run left state behind. Remove it.
    rmRecursive(stagingRoot)
  }
  mkdirSync(stagingRoot, { recursive: true })

  try {
    // 1. MANIFEST.json
    writeFileSyncMkdir(join(stagingRoot, 'MANIFEST.json'), JSON.stringify(manifest, null, 2))

    // 2. .env
    if (envIncluded) {
      const envSrc = join(repoRoot, '.env')
      copyFileMkdir(envSrc, join(stagingRoot, '.env'))
    }

    // 3. config files
    for (const rel of configsPresent) {
      const src = join(repoRoot, rel)
      const dst = join(stagingRoot, rel)
      copyFileMkdir(src, dst)
    }

    // 4. volumes
    for (const vm of volumeMounts) {
      const dst = join(stagingRoot, 'volumes', vm.name)
      mkdirSync(dst, { recursive: true })
      copyDirRecursive(vm.path, dst)
    }

    // 5. Produce the tarball from the staging tree.
    await tar.create(
      {
        gzip: true,
        file: tarballPath,
        cwd: stagingRoot,
        // Stable file ordering: list MANIFEST.json first so streaming
        // restores can read it without buffering the whole archive.
        portable: true,
      },
      readdirSync(stagingRoot),
    )
  } finally {
    rmRecursive(stagingRoot)
  }
}

// ── Volume discovery ──────────────────────────────────────────────────

/**
 * Read the top-level `volumes:` block from a docker-compose.yml.
 *
 * Returns the volume *names* as declared in compose (e.g. `admin-data`),
 * NOT the prefixed docker-volume names (which is `<project>_<name>`).
 */
export function readVolumeNames(composeFile: string): string[] {
  const raw = readFileSync(composeFile, 'utf8')
  const parsed = yaml.load(raw) as { volumes?: Record<string, unknown> } | null
  if (!parsed || typeof parsed !== 'object') return []
  const v = parsed.volumes
  if (!v || typeof v !== 'object') return []
  return Object.keys(v)
}

/**
 * The docker-compose project prefix is normally the basename of the
 * compose-file directory. `COMPOSE_PROJECT_NAME` overrides it. Strip
 * out anything compose normalises (lowercase + remove some punctuation)
 * — we use the same rule docker-compose uses (`a-z0-9_`-only,
 * lowercased).
 */
export function resolveProjectName(repoRoot: string): string {
  const override = process.env.COMPOSE_PROJECT_NAME
  if (override) return normaliseProjectName(override)
  return normaliseProjectName(basename(resolve(repoRoot)))
}

function normaliseProjectName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9_-]/g, '')
}

/**
 * Ask docker for the mount point of a named volume. When `volumesBase`
 * is set, short-circuit for tests.
 */
export function resolveVolumeHostPath(
  volumeName: string,
  projectName: string,
  volumesBase?: string,
): string {
  if (volumesBase) {
    const fake = join(resolve(volumesBase), volumeName)
    if (!existsSync(fake)) {
      // Create the dir so callers can rely on it existing — eases tests
      // that backup an empty volume.
      mkdirSync(fake, { recursive: true })
    }
    return fake
  }
  const dockerName = `${projectName}_${volumeName}`
  try {
    const out = execFileSync(
      'docker',
      ['volume', 'inspect', dockerName, '--format', '{{.Mountpoint}}'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    ).trim()
    if (!out) throw new Error(`empty mountpoint for volume ${dockerName}`)
    return out
  } catch (err) {
    // `docker volume inspect` answers "Error: No such volume: <name>" (exit 1)
    // for a volume compose has not created yet — see VolumeNotCreatedError.
    const stderr = String((err as { stderr?: unknown }).stderr ?? '')
    if (/no such volume/i.test(stderr)) throw new VolumeNotCreatedError(dockerName)
    throw new Error(
      `Failed to resolve docker volume "${dockerName}": ${
        err instanceof Error ? err.message : String(err)
      }\n` +
        `Is docker running? Has \`docker compose up -d\` been run at least once ` +
        `from this repo? (Volumes are created lazily on first up.)`,
      { cause: err },
    )
  }
}

// ── Manifest helpers ──────────────────────────────────────────────────

function tryGitSha(repoRoot: string): string {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim()
  } catch {
    return 'unknown'
  }
}

/**
 * Best-effort fetch of `GET http://localhost:<port>/version` for each
 * known service. Records the version string on success, `"unknown"` on
 * any failure (timeout, connection refused, 404, non-JSON, etc).
 *
 * Intentionally non-fatal: a service that lacks /version or is down
 * still yields a usable backup.
 */
async function probeServiceVersions(
  probes: Record<string, number>,
): Promise<Record<string, string>> {
  const result: Record<string, string> = {}
  const entries = Object.entries(probes)
  await Promise.all(
    entries.map(async ([name, port]) => {
      try {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), 1500)
        const res = await fetch(`http://localhost:${port}/version`, {
          signal: controller.signal,
        })
        clearTimeout(timer)
        if (!res.ok) {
          result[name] = 'unknown'
          return
        }
        const body = (await res.json()) as { version?: string }
        result[name] = typeof body.version === 'string' && body.version ? body.version : 'unknown'
      } catch {
        result[name] = 'unknown'
      }
    }),
  )
  return result
}

/**
 * Walk every volume mount and, for each `.db` file found, read the
 * `_schema_migrations` tracker (added by `applyMigrations`). Result is
 * keyed by db-file path *relative to the repo root convention* — we use
 * the path under the volume name so the manifest is portable.
 *
 * Errors during reading (corrupt db, missing tracker table) are logged
 * to stderr but don't fail the backup; the entry is simply omitted.
 */
function collectSchemaVersions(
  volumeMounts: Array<{ name: string; path: string }>,
): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {}
  for (const vm of volumeMounts) {
    for (const dbFile of findDbFiles(vm.path)) {
      const key = `volumes/${vm.name}/${relative(vm.path, dbFile)}`
      try {
        const db = new Database(dbFile, { readonly: true, fileMustExist: true })
        try {
          const hasTracker = db
            .prepare(
              "SELECT name FROM sqlite_master WHERE type='table' AND name='_schema_migrations'",
            )
            .get() as { name?: string } | undefined
          if (!hasTracker?.name) continue
          const rows = db
            .prepare(
              'SELECT namespace, MAX(version) AS v FROM _schema_migrations GROUP BY namespace',
            )
            .all() as Array<{ namespace: string; v: number }>
          if (rows.length > 0) {
            out[key] = Object.fromEntries(rows.map((r) => [r.namespace, r.v]))
          }
        } finally {
          db.close()
        }
      } catch (err) {
        process.stderr.write(
          `[backup] could not read schema versions from ${dbFile}: ${
            err instanceof Error ? err.message : String(err)
          }\n`,
        )
      }
    }
  }
  return out
}

// ── WAL guard ────────────────────────────────────────────────────────

/**
 * Mirror of `rotate-store-secret.ts:assertNoLiveWriter`. Refuses to run
 * if a -wal or -shm sibling was modified inside `WAL_FRESH_THRESHOLD_MS`.
 */
function assertNoLiveWriter(dbPath: string): void {
  const abs = resolve(dbPath)
  for (const suffix of ['-wal', '-shm']) {
    const sibling = `${abs}${suffix}`
    if (!existsSync(sibling)) continue
    const ageMs = Date.now() - statSync(sibling).mtimeMs
    if (ageMs < WAL_FRESH_THRESHOLD_MS) {
      throw new Error(
        `${sibling} was modified ${Math.round(ageMs / 1000)}s ago — a writer is still ` +
          `attached. Stop services before backing up: ` +
          `\`docker compose stop\``,
      )
    }
  }
}

// ── Filesystem helpers ───────────────────────────────────────────────

/** Walk a directory tree and return every file ending in `.db`. */
function findDbFiles(root: string): string[] {
  const out: string[] = []
  if (!existsSync(root)) return out
  const stack: string[] = [root]
  while (stack.length > 0) {
    const cur = stack.pop()!
    let entries: Dirent[]
    try {
      entries = readdirSync(cur, { withFileTypes: true })
    } catch {
      continue
    }
    for (const e of entries) {
      const p = join(cur, e.name)
      if (e.isDirectory()) {
        stack.push(p)
      } else if (e.isFile() && p.endsWith('.db')) {
        out.push(p)
      }
    }
  }
  return out
}

function writeFileSyncMkdir(path: string, data: string | Buffer): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, data)
}

function copyFileMkdir(src: string, dst: string): void {
  mkdirSync(dirname(dst), { recursive: true })
  copyFileSync(src, dst)
}

/** Recursive copy. Skip -wal / -shm sidecars (transient writer artefacts). */
function copyDirRecursive(src: string, dst: string): void {
  if (!existsSync(src)) return
  const stack: Array<{ s: string; d: string }> = [{ s: src, d: dst }]
  while (stack.length > 0) {
    const { s, d } = stack.pop()!
    mkdirSync(d, { recursive: true })
    const entries = readdirSync(s, { withFileTypes: true })
    for (const e of entries) {
      const sp = join(s, e.name)
      const dp = join(d, e.name)
      if (e.isDirectory()) {
        stack.push({ s: sp, d: dp })
      } else if (e.isFile()) {
        // Skip sqlite writer sidecars — they're noise in a snapshot, and
        // restoring them confuses better-sqlite3 on the next boot.
        if (e.name.endsWith('-wal') || e.name.endsWith('-shm')) continue
        copyFileSync(sp, dp)
      }
    }
  }
}

function rmRecursive(path: string): void {
  rmSync(path, { recursive: true, force: true })
}

// ── CLI entry point ──────────────────────────────────────────────────

export function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    repoRoot: process.cwd(),
    outDir: join(process.cwd(), 'backups'),
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--repo-root') {
      args.repoRoot = argv[++i] ?? args.repoRoot
      // Re-anchor outDir to the new root unless --out-dir was already set
      // explicitly later in argv (handled below).
      args.outDir = join(args.repoRoot, 'backups')
    } else if (a === '--out-dir') {
      args.outDir = argv[++i] ?? args.outDir
    } else if (a === '--unsafe-allow-live-db') {
      args.unsafeAllowLiveDb = true
    } else if (a === '--volumes-base') {
      args.volumesBase = argv[++i] ?? ''
    } else if (a === '--help' || a === '-h') {
      printUsage()
      process.exit(0)
    } else {
      throw new Error(`unknown argument: ${a}`)
    }
  }
  return args
}

function printUsage(): void {
  process.stdout.write(
    [
      'backup — snapshot every docker volume + .env + config files into a single tarball',
      '',
      'Usage:',
      '  pnpm backup [--repo-root <path>] [--out-dir <path>]',
      '',
      'Run from the repo root. Stop services first — the tool refuses if a writer is still attached.',
      '',
      'Output:',
      '  backups/opensteward-<ISO timestamp>.tar.gz',
      '',
      'Restore with:',
      '  pnpm restore backups/<file>.tar.gz',
      '',
      'Test-only flags:',
      '  --unsafe-allow-live-db   skip the WAL guard (CI/unit tests)',
      '  --volumes-base <path>    resolve volumes under <path>/<name> instead of via docker',
      '',
    ].join('\n'),
  )
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  const result = await runBackup(args)
  process.stdout.write(`\nWrote ${result.tarballPath}\n`)
  process.stdout.write(`  volumes:        ${result.manifest.volumes.join(', ')}\n`)
  if (result.manifest.skippedVolumes) {
    process.stdout.write(
      `  skipped:        ${result.manifest.skippedVolumes.join(', ')} (never created — nothing to back up)\n`,
    )
  }
  process.stdout.write(`  env included:   ${result.manifest.envIncluded ? 'yes' : 'no'}\n`)
  process.stdout.write(`  config files:   ${result.manifest.configFiles.length}\n`)
  process.stdout.write(`  git sha:        ${result.manifest.gitSha}\n`)
  const svcVer = Object.entries(result.manifest.serviceVersions)
    .map(([s, v]) => `${s}=${v}`)
    .join(' ')
  process.stdout.write(`  service vers:   ${svcVer || '(none probed)'}\n`)
  process.stdout.write(
    `  schema-namespaces: ${Object.keys(result.manifest.schemaVersions).length}\n`,
  )
}

// Only invoke main() when this file is the script entry point, not when
// imported by tests.
const isMain =
  typeof process !== 'undefined' &&
  process.argv[1] != null &&
  (process.argv[1].endsWith('backup.ts') ||
    process.argv[1].endsWith('backup.js') ||
    process.argv[1].endsWith('backup'))
if (isMain) {
  main().catch((err: unknown) => {
    process.stderr.write(`error: ${err instanceof Error ? err.message : String(err)}\n`)
    process.exit(1)
  })
}
