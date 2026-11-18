/**
 * Background maintenance for the data-store layer:
 *  - daily `SyncStore.cleanup(30)` — drops completed/failed jobs older than 30 days
 *  - hourly disk-size monitor on `resources.db` — WARN at maxSizeMb,
 *    ERROR at 10× that value
 *  - one-shot NFS heuristic on boot — WARN if STORE_PATH looks NFS-mounted
 *    (multi-writer SQLite contention is unsafe on NFS).
 */
import { statSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import type { SyncStore } from '@opensteward/shared'

const DAY_MS = 24 * 60 * 60 * 1000
const HOUR_MS = 60 * 60 * 1000
const DEFAULT_WARN_MB = 100

interface Logger {
  info: (msg: string) => void
  warn: (msg: string) => void
  error: (msg: string) => void
}

interface PinoLikeLogger {
  info: (...args: unknown[]) => void
  warn: (...args: unknown[]) => void
  error: (...args: unknown[]) => void
}

function toLogger(log: Logger | PinoLikeLogger): Logger {
  return {
    info: (msg) => log.info(msg),
    warn: (msg) => log.warn(msg),
    error: (msg) => log.error(msg),
  }
}

export interface MaintenanceOptions {
  logger: Logger | PinoLikeLogger
  syncStore: SyncStore
  resourceDbPath: string
  /** WARN threshold in MB. ERROR fires at 10× this. Default 100 (so ERROR
   *  at 1000). Set to `0` to disable the size monitor. */
  maxSizeMb?: number
  /** Override the cleanup interval (test hook). Default 24h. */
  cleanupIntervalMs?: number
  /** Override the size-check interval (test hook). Default 1h. */
  sizeCheckIntervalMs?: number
}

export interface MaintenanceHandle {
  stop(): void
}

export function startDataStoreMaintenance(opts: MaintenanceOptions): MaintenanceHandle {
  const log = toLogger(opts.logger)
  const warnMb = opts.maxSizeMb ?? DEFAULT_WARN_MB
  const cleanupMs = opts.cleanupIntervalMs ?? DAY_MS
  const sizeMs = opts.sizeCheckIntervalMs ?? HOUR_MS

  // One-shot heuristic on boot.
  if (looksLikeNFS(opts.resourceDbPath)) {
    log.warn(
      `data-store: ${opts.resourceDbPath} appears to be on a network filesystem (NFS-like). SQLite multi-writer semantics are unsafe over NFS — concurrent integration-server replicas writing to the same file will corrupt the database. Use mode=external or a single-replica deployment.`,
    )
  }

  // First-pass size check on boot.
  checkSize(opts.resourceDbPath, warnMb, log)

  const cleanupTimer = setInterval(() => {
    void (async () => {
      try {
        const removed = await opts.syncStore.cleanup(30)
        if (removed > 0) log.info(`data-store: cleaned ${removed} old sync_jobs`)
      } catch (err) {
        log.warn(`data-store: cleanup failed: ${err}`)
      }
    })()
  }, cleanupMs)

  const sizeTimer = warnMb > 0
    ? setInterval(() => checkSize(opts.resourceDbPath, warnMb, log), sizeMs)
    : null

  return {
    stop() {
      clearInterval(cleanupTimer)
      if (sizeTimer) clearInterval(sizeTimer)
    },
  }
}

function checkSize(path: string, warnMb: number, log: Logger): void {
  try {
    const sizeMb = statSync(path).size / (1024 * 1024)
    if (sizeMb >= warnMb * 10) {
      log.error(
        `data-store: resources.db is ${sizeMb.toFixed(1)} MB (>= ${warnMb * 10} MB). Run a /admin/connections/:id/cache-clear pass or shrink with VACUUM.`,
      )
    } else if (sizeMb >= warnMb) {
      log.warn(
        `data-store: resources.db is ${sizeMb.toFixed(1)} MB (warn threshold ${warnMb} MB). Consider raising dataStore.maxSizeMb or pruning old connections.`,
      )
    }
  } catch {
    /* file may not exist yet on first boot — silent */
  }
}

function looksLikeNFS(path: string): boolean {
  // No shell: `execFileSync` skips shell interpolation so a malicious
  // STORE_PATH cannot inject commands. Try `df -T <path>` first (Linux
  // prints fs type); fall back to `mount` if `df -T` is unsupported
  // (BSD/mac). stderr is silenced via stdio.
  const runQuiet = (cmd: string, args: string[]): string => {
    return execFileSync(cmd, args, {
      encoding: 'utf8',
      timeout: 1000,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
  }
  let out = ''
  try {
    out = runQuiet('df', ['-T', path])
  } catch {
    try {
      out = runQuiet('mount', [])
    } catch {
      return false
    }
  }
  return /\bnfs\d?\b/i.test(out) && out.includes(path.split('/')[1] ?? '')
}
