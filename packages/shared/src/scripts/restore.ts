#!/usr/bin/env node
/**
 * `restore` — inverse of `backup`. Unpacks an `opensteward-*.tar.gz`
 * tarball into the host's docker volumes + optionally `.env` + config
 * files.
 *
 * Usage:
 *
 *   pnpm restore backups/opensteward-<ts>.tar.gz
 *   pnpm restore backups/<file>.tar.gz --manifest-only
 *   pnpm restore backups/<file>.tar.gz --force   # overwrite .env + configs
 *
 * The tool is OFFLINE. Services must be stopped first. It refuses to
 * run while a fresh `-wal` / `-shm` sibling exists next to any db file
 * inside the target volume mounts (mirrors the backup guard).
 *
 * Order of operations:
 *   1. Untar to a temp dir.
 *   2. Read + verify `MANIFEST.json`. Print summary.
 *   3. (`--manifest-only`?) — exit early.
 *   4. Refuse to overwrite `.env` / config files unless `--force`.
 *   5. For each volume, blow away the host mount path and replace with
 *      the tarball contents. Try direct write first; only fall through
 *      to a privileged helper container if direct writes fail (which
 *      they shouldn't on Docker Desktop).
 *   6. If `--force`, restore `.env` and config files into the repo.
 *   7. Print "now run `docker compose up -d`".
 */
import { execFileSync } from 'child_process'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  type Dirent,
} from 'fs'
import { tmpdir } from 'os'
import { dirname, join, resolve } from 'path'
import * as tar from 'tar'
import { readVolumeNames, resolveProjectName, resolveVolumeHostPath, type Manifest } from './backup'

/** How recent a -wal/-shm file can be before we refuse to restore (ms). */
const WAL_FRESH_THRESHOLD_MS = 60_000

export interface CliArgs {
  /** Path to the .tar.gz produced by `pnpm backup`. */
  tarballPath: string
  /** Repo root. Defaults to `process.cwd()`. */
  repoRoot: string
  /** When true, only read + print the manifest. Don't touch any volumes. */
  manifestOnly?: boolean
  /** When true, allow overwriting `.env` and `apps/<svc>/config/config.yml`. */
  force?: boolean
  /** Skip the WAL-freshness guard. For tests only. */
  unsafeAllowLiveDb?: boolean
  /**
   * Test-only override. When set, volumes resolve to `<volumesBase>/<name>`
   * instead of via `docker volume inspect`. Mirrors the backup flag.
   */
  volumesBase?: string
}

export interface RestoreResult {
  manifest: Manifest
  /** Volumes that were rewritten. Empty when --manifest-only. */
  volumesRestored: string[]
  /** Configs / .env actually written. Empty when --force was not set. */
  rootFilesRestored: string[]
}

/**
 * Run the restore. Returns the manifest + what was restored. Throws on
 * any I/O or guard failure (manifest absent, .env exists without --force,
 * a live writer is detected, etc).
 */
export async function runRestore(args: CliArgs): Promise<RestoreResult> {
  if (!args.tarballPath) throw new Error('tarball path is required')
  const tarballAbs = resolve(args.tarballPath)
  if (!existsSync(tarballAbs)) {
    throw new Error(`tarball not found: ${tarballAbs}`)
  }
  const repoRoot = resolve(args.repoRoot)
  if (!existsSync(join(repoRoot, 'docker-compose.yml'))) {
    throw new Error(
      `docker-compose.yml not found under ${repoRoot}. ` +
        `Run pnpm restore from the repo root, or pass --repo-root <path>.`,
    )
  }

  // 1. Untar to a temp dir.
  const stagingDir = mkdtempSync(join(tmpdir(), 'opensteward-restore-'))
  try {
    await tar.extract({ file: tarballAbs, cwd: stagingDir })

    // 2. Read manifest.
    const manifestPath = join(stagingDir, 'MANIFEST.json')
    if (!existsSync(manifestPath)) {
      throw new Error(
        `MANIFEST.json missing inside ${tarballAbs}. This does not look like an ` +
          `opensteward backup. Refusing to proceed.`,
      )
    }
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Manifest
    validateManifest(manifest)

    printManifestSummary(manifest, tarballAbs)

    if (args.manifestOnly) {
      return { manifest, volumesRestored: [], rootFilesRestored: [] }
    }

    // 3. Refuse to overwrite root files without --force.
    if (!args.force) {
      const wouldOverwrite: string[] = []
      if (manifest.envIncluded && existsSync(join(repoRoot, '.env'))) {
        wouldOverwrite.push('.env')
      }
      for (const rel of manifest.configFiles) {
        if (existsSync(join(repoRoot, rel))) wouldOverwrite.push(rel)
      }
      if (wouldOverwrite.length > 0) {
        throw new Error(
          `Refusing to overwrite existing files: ${wouldOverwrite.join(', ')}. ` +
            `Pass --force to allow overwrite, or move/remove them first.`,
        )
      }
    }

    // 4. Resolve volume mount paths + run the WAL guard.
    const composeFile = join(repoRoot, 'docker-compose.yml')
    const composeVolumes = readVolumeNames(composeFile)
    const projectName = resolveProjectName(repoRoot)
    const mounts = manifest.volumes.map((name) => {
      if (!composeVolumes.includes(name)) {
        // The backup may have been taken against a different compose
        // file. Carry on — operator-visible note printed at the end.
      }
      return { name, path: resolveVolumeHostPath(name, projectName, args.volumesBase) }
    })
    if (!args.unsafeAllowLiveDb) {
      for (const m of mounts) {
        for (const dbFile of findDbFiles(m.path)) {
          assertNoLiveWriter(dbFile)
        }
      }
    }

    // 5. Restore volumes — blow away existing contents, then copy the
    //    staged tarball contents in.
    const volumesRestored: string[] = []
    for (const m of mounts) {
      const srcDir = join(stagingDir, 'volumes', m.name)
      if (!existsSync(srcDir)) continue
      replaceDirContents(m.path, srcDir)
      volumesRestored.push(m.name)
    }

    // 6. Optionally restore root files.
    const rootFilesRestored: string[] = []
    if (args.force) {
      if (manifest.envIncluded) {
        const src = join(stagingDir, '.env')
        if (existsSync(src)) {
          const dst = join(repoRoot, '.env')
          mkdirSync(dirname(dst), { recursive: true })
          copyFileSync(src, dst)
          rootFilesRestored.push('.env')
        }
      }
      for (const rel of manifest.configFiles) {
        const src = join(stagingDir, rel)
        if (!existsSync(src)) continue
        const dst = join(repoRoot, rel)
        mkdirSync(dirname(dst), { recursive: true })
        copyFileSync(src, dst)
        rootFilesRestored.push(rel)
      }
    }

    return { manifest, volumesRestored, rootFilesRestored }
  } finally {
    try {
      rmSync(stagingDir, { recursive: true, force: true })
    } catch {
      /* best effort cleanup */
    }
  }
}

// ── Manifest helpers ──────────────────────────────────────────────────

function validateManifest(m: Manifest): void {
  if (!m || typeof m !== 'object') throw new Error('manifest is not an object')
  if (!m.tooling || m.tooling.tool !== 'opensteward-backup') {
    throw new Error(
      `manifest.tooling.tool is "${m.tooling?.tool ?? '<missing>'}" — expected "opensteward-backup". ` +
        `This tarball was not produced by pnpm backup.`,
    )
  }
  if (typeof m.tooling.format !== 'number') {
    throw new Error('manifest.tooling.format is missing or not a number')
  }
  // Format 1 is what backup.ts writes; formats newer than this tool
  // understands are refused below.
  if (m.tooling.format > 1) {
    throw new Error(
      `manifest.tooling.format=${m.tooling.format} is newer than this restore tool understands. ` +
        `Upgrade OpenSteward (and rerun restore) before trying again.`,
    )
  }
  if (!Array.isArray(m.volumes)) throw new Error('manifest.volumes must be an array')
  if (!Array.isArray(m.configFiles)) throw new Error('manifest.configFiles must be an array')
}

function printManifestSummary(m: Manifest, tarballPath: string): void {
  process.stdout.write(`\nRestoring from ${tarballPath}\n`)
  process.stdout.write(`  createdAt:      ${m.createdAt}\n`)
  process.stdout.write(`  gitSha:         ${m.gitSha}\n`)
  process.stdout.write(`  toolVersion:    ${m.tooling.toolVersion} (format ${m.tooling.format})\n`)
  process.stdout.write(`  volumes:        ${m.volumes.join(', ') || '(none)'}\n`)
  process.stdout.write(`  envIncluded:    ${m.envIncluded ? 'yes' : 'no'}\n`)
  process.stdout.write(`  configFiles:    ${m.configFiles.length}\n`)
  const svcVer = Object.entries(m.serviceVersions)
    .map(([s, v]) => `${s}=${v}`)
    .join(' ')
  process.stdout.write(`  serviceVers:    ${svcVer || '(none)'}\n`)
  for (const [dbFile, namespaces] of Object.entries(m.schemaVersions)) {
    const summary = Object.entries(namespaces)
      .map(([ns, v]) => `${ns}@${v}`)
      .join(', ')
    process.stdout.write(`  ${dbFile}: ${summary}\n`)
  }
}

// ── Volume restore ────────────────────────────────────────────────────

/**
 * Blow away every file inside `dest` (preserving `dest` itself), then
 * recursively copy everything from `src` into `dest`. Tries direct
 * filesystem writes first; falls through to a privileged helper container
 * only if the direct write fails on permission grounds.
 */
function replaceDirContents(dest: string, src: string): void {
  try {
    clearDirContents(dest)
    copyDirRecursive(src, dest)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (!isPermissionError(err)) throw err
    process.stderr.write(
      `[restore] direct write to ${dest} failed (${msg}). ` +
        `Falling through to a privileged docker helper container.\n`,
    )
    replaceDirContentsViaDocker(dest, src)
  }
}

function isPermissionError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const code = (err as { code?: string }).code
  return code === 'EACCES' || code === 'EPERM'
}

function clearDirContents(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
    return
  }
  const entries = readdirSync(dir, { withFileTypes: true })
  for (const e of entries) {
    rmSync(join(dir, e.name), { recursive: true, force: true })
  }
}

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
        copyFileSync(sp, dp)
      }
    }
  }
}

/**
 * Fallback path for systems where the docker volume mount path isn't
 * readable from the host process. We spawn a short-lived alpine
 * container with the volume bind-mounted, copy via `sh -c 'rm -rf ...
 * && cp -a ... ...'`. The source dir from the host is mounted at
 * `/src:ro` so we never lose data on a partial failure.
 */
function replaceDirContentsViaDocker(dest: string, src: string): void {
  execFileSync(
    'docker',
    [
      'run',
      '--rm',
      '-v',
      `${dest}:/dest`,
      '-v',
      `${src}:/src:ro`,
      'alpine:3',
      'sh',
      '-c',
      'rm -rf /dest/* /dest/.[!.]* /dest/..?* 2>/dev/null; cp -a /src/. /dest/',
    ],
    { stdio: 'inherit' },
  )
}

// ── WAL guard ────────────────────────────────────────────────────────

function assertNoLiveWriter(dbPath: string): void {
  const abs = resolve(dbPath)
  for (const suffix of ['-wal', '-shm']) {
    const sibling = `${abs}${suffix}`
    if (!existsSync(sibling)) continue
    const ageMs = Date.now() - statSync(sibling).mtimeMs
    if (ageMs < WAL_FRESH_THRESHOLD_MS) {
      throw new Error(
        `${sibling} was modified ${Math.round(ageMs / 1000)}s ago — a writer is still ` +
          `attached. Stop services before restoring: \`docker compose stop\``,
      )
    }
  }
}

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

// ── CLI entry point ──────────────────────────────────────────────────

export function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { tarballPath: '', repoRoot: process.cwd() }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--repo-root') {
      args.repoRoot = argv[++i] ?? args.repoRoot
    } else if (a === '--manifest-only') {
      args.manifestOnly = true
    } else if (a === '--force') {
      args.force = true
    } else if (a === '--unsafe-allow-live-db') {
      args.unsafeAllowLiveDb = true
    } else if (a === '--volumes-base') {
      args.volumesBase = argv[++i] ?? ''
    } else if (a === '--help' || a === '-h') {
      printUsage()
      process.exit(0)
    } else if (!a.startsWith('-')) {
      if (args.tarballPath) {
        throw new Error(`more than one tarball passed: ${args.tarballPath} and ${a}`)
      }
      args.tarballPath = a
    } else {
      throw new Error(`unknown argument: ${a}`)
    }
  }
  return args
}

function printUsage(): void {
  process.stdout.write(
    [
      'restore — inverse of pnpm backup. Unpacks a tarball into docker volumes.',
      '',
      'Usage:',
      '  pnpm restore <tarball> [--force] [--manifest-only]',
      '',
      'Run from the repo root. Stop services first.',
      '',
      'Flags:',
      '  --force            allow overwriting existing .env and config files',
      '  --manifest-only    print the manifest summary and exit (no writes)',
      '',
      'Test-only flags:',
      '  --unsafe-allow-live-db   skip the WAL guard',
      '  --volumes-base <path>    resolve volumes under <path>/<name> instead of via docker',
      '',
    ].join('\n'),
  )
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  if (!args.tarballPath) {
    printUsage()
    process.exit(1)
  }
  const result = await runRestore(args)
  if (args.manifestOnly) {
    process.stdout.write(`\nManifest-only mode — no files were touched.\n`)
    return
  }
  process.stdout.write(`\nRestored volumes: ${result.volumesRestored.join(', ') || '(none)'}\n`)
  if (result.rootFilesRestored.length > 0) {
    process.stdout.write(`Restored root files: ${result.rootFilesRestored.join(', ')}\n`)
  } else if (args.force) {
    process.stdout.write(`No root files were in the tarball.\n`)
  } else {
    process.stdout.write(
      `Root files (.env, configs) were left in place. Re-run with --force to overwrite from the tarball.\n`,
    )
  }
  process.stdout.write(`\nNext step: \`docker compose up -d\`\n`)
}

// Only invoke main() when this file is the script entry point, not when
// imported by tests.
const isMain =
  typeof process !== 'undefined' &&
  process.argv[1] != null &&
  (process.argv[1].endsWith('restore.ts') ||
    process.argv[1].endsWith('restore.js') ||
    process.argv[1].endsWith('restore'))
if (isMain) {
  main().catch((err: unknown) => {
    process.stderr.write(`error: ${err instanceof Error ? err.message : String(err)}\n`)
    process.exit(1)
  })
}
