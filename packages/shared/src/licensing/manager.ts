import { createHash } from 'node:crypto'
import { readFileSync, statSync, watch, type FSWatcher } from 'node:fs'
import { basename, dirname } from 'node:path'
import type { KeyMap } from '@opensteward/license-token'
import { EntitlementService } from './entitlements'
import { communityStatus, evaluateLicense } from './evaluate'
import { getKeyring, isDevKid } from './keyring'
import { formatLicenseLogLine } from './log'
import { loadRevocations, type RevocationState } from './revocation-state'
import { REVOCATION_LIST_TOKEN } from './revocations'
import {
  MAX_LICENSE_FILE_BYTES,
  isTokenAsPath,
  readLicenseSource,
  type LicenseConfig,
} from './source'
import type { ClockObservation } from './time'
import type { LicenseStatus } from './types'

export const LICENSE_TICK_INTERVAL_MS = 60 * 60 * 1000
/** Non-VALID states repeat their line about once a day: every 24th hourly tick. */
const REMINDER_EVERY_TICKS = 24
const DEFAULT_DEBOUNCE_MS = 500

export interface LicenseLogger {
  info(message: string, fields?: Record<string, unknown>): void
  warn(message: string, fields?: Record<string, unknown>): void
  error(message: string, fields?: Record<string, unknown>): void
}
export interface LicenseClockStore {
  observe(systemNowMs: number): Promise<ClockObservation>
}
export interface LicenseManagerOptions {
  config: LicenseConfig
  /** The clock-rollback store (LicenseStateStore). Omitted or failing: the system clock, with a warning. */
  stateStore?: LicenseClockStore
  /** false removes this build's development keys from the ring. It can only remove: nothing adds a key. */
  includeDevKeys?: boolean
  now?: () => number
  logger?: LicenseLogger
  tickIntervalMs?: number
  /** Watch the license file's directory. Default true; never while an env token is set. */
  watch?: boolean
  debounceMs?: number
}
/**
 * Typed `=> void` so any callback fits, an expression-bodied arrow included.
 * An async one is still safe: its rejection is logged like a throw, never left
 * unhandled.
 */
export type LicenseChangeListener = (next: LicenseStatus, previous: LicenseStatus) => void

type Level = keyof LicenseLogger

const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e))
/** A Date outside its range (|ms| > 8.64e15, NaN, ±Infinity) has no ISO form: toISOString throws. */
const inDateRange = (ms: number): boolean => !Number.isNaN(new Date(ms).getTime())
const isoOrNow = (ms: number): string => new Date(inDateRange(ms) ? ms : Date.now()).toISOString()
/** For log text: the ISO time, or the raw value when it has none (a corrupted max_seen_at). */
const timeText = (ms: number): string =>
  inDateRange(ms) ? new Date(ms).toISOString() : `${ms} ms (not a valid time)`
const consoleLogger: LicenseLogger = {
  info: (m) => console.log(m),
  warn: (m) => console.warn(m),
  error: (m) => console.error(m),
}

/** What makes two evaluations "the same", for logging and listeners. */
function fingerprint(s: LicenseStatus): string {
  const { evaluatedAt: _evaluatedAt, daysRemaining: _daysRemaining, ...rest } = s
  return JSON.stringify(rest)
}

/** mtime plus content hash of the license file; null when there is none. */
function fileSignature(path: string): string | null {
  try {
    const st = statSync(path)
    if (!st.isFile()) return null
    if (st.size > MAX_LICENSE_FILE_BYTES) return `${st.mtimeMs}:${st.size}`
    return `${st.mtimeMs}:${createHash('sha256').update(readFileSync(path)).digest('hex')}`
  } catch {
    return null
  }
}

/**
 * Loads, verifies and keeps the license current. integration-server owns the
 * only instance (D-A).
 *
 * It re-evaluates at startup, on an hourly unref'd tick (which also compares the
 * file's mtime and hash), and on a change in the license file's DIRECTORY. A
 * Kubernetes Secret update renames `..data`, which a watch on the file itself
 * never sees. Never throws: every failure degrades to community entitlements
 * with a logged reason. Nothing starts at import or in create(): the tick and
 * the watch start in start().
 */
export class LicenseManager {
  private readonly keyMap: KeyMap
  private readonly devKeysTrusted: boolean
  private readonly revocations: RevocationState
  private readonly now: () => number
  private readonly log: LicenseLogger
  private status: LicenseStatus
  private ent: EntitlementService
  private fp = ''
  private evaluated = false
  private stopped = false
  private ticks = 0
  private signature: string | null = null
  private running: Promise<LicenseStatus> | null = null
  /** Why each refresh() that arrived during a run was asked for: the re-run they share carries all of them. */
  private pending = new Set<string>()
  private timer: ReturnType<typeof setInterval> | null = null
  private debounce: ReturnType<typeof setTimeout> | null = null
  private watcher: FSWatcher | null = null
  private readonly listeners = new Set<LicenseChangeListener>()

  static async create(opts: LicenseManagerOptions): Promise<LicenseManager> {
    const m = new LicenseManager(opts)
    await m.refresh('startup')
    return m
  }

  private constructor(private readonly opts: LicenseManagerOptions) {
    this.keyMap = getKeyring({ includeDevKeys: opts.includeDevKeys })
    this.devKeysTrusted = Object.keys(this.keyMap).some(isDevKid)
    this.now = opts.now ?? Date.now
    this.log = opts.logger ?? consoleLogger
    // The list is a compile-time constant and its check needs no clock, so one verification holds for the process.
    this.revocations = loadRevocations(REVOCATION_LIST_TOKEN, this.keyMap)
    this.status = this.failed()
    this.ent = new EntitlementService(this.status)
  }

  current(): LicenseStatus {
    return this.status
  }
  entitlements(): EntitlementService {
    return this.ent
  }
  onChange(listener: LicenseChangeListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /**
   * Re-read and re-evaluate. Concurrent calls share one run (and trigger one
   * more if needed). That re-run carries the reasons of the calls that asked
   * for it, not the first caller's: a file change caught by the watch during a
   * tick is not reported as found by the hourly re-read, and a tick that lands
   * during another run is still counted, once.
   */
  refresh(reason = 'manual'): Promise<LicenseStatus> {
    if (this.stopped) return Promise.resolve(this.status)
    if (this.running) {
      this.pending.add(reason)
      return this.running
    }
    const run = (async () => {
      let reasons: ReadonlySet<string> = new Set([reason])
      try {
        do {
          this.pending = new Set()
          await this.evaluateOnce(reasons)
          reasons = this.pending
        } while (reasons.size > 0 && !this.stopped)
      } finally {
        this.running = null
        this.pending = new Set()
      }
      return this.status
    })()
    this.running = run
    return run
  }

  start(): void {
    if (this.timer || this.stopped) return
    this.timer = setInterval(
      () => void this.refresh('tick'),
      this.opts.tickIntervalMs ?? LICENSE_TICK_INTERVAL_MS,
    )
    this.timer.unref()
    if (this.opts.watch !== false && this.usesFile()) this.watchDirectory()
  }

  /**
   * The file is the license source. Not when an env token wins (§5.1): a change
   * to the file changes nothing. Not when the path is really a token
   * (isTokenAsPath): that is never stat'ed, watched or named in a log line.
   */
  private usesFile(): boolean {
    return !this.opts.config.envToken?.trim() && !isTokenAsPath(this.opts.config.filePath)
  }

  async stop(): Promise<void> {
    this.stopped = true
    if (this.timer) clearInterval(this.timer)
    if (this.debounce) clearTimeout(this.debounce)
    this.timer = null
    this.debounce = null
    this.watcher?.close()
    this.watcher = null
    if (this.running) await this.running.catch(() => undefined)
  }

  /** Every line goes through here: a throwing logger never breaks licensing, or boot. */
  private say(level: Level, message: string, fields?: Record<string, unknown>): void {
    try {
      if (fields === undefined) this.log[level](message)
      else this.log[level](message, fields)
    } catch {
      // Nothing to report it to.
    }
  }

  private watchDirectory(): void {
    const dir = dirname(this.opts.config.filePath)
    const name = basename(this.opts.config.filePath)
    try {
      const w = watch(dir, { persistent: false }, (_event, changed) => {
        // By default the directory also holds credentials.db and its WAL (P4),
        // and every observe() writes there: refresh only for the license file,
        // a Kubernetes Secret's ..data swap, or an event that names no file.
        const n = changed?.toString()
        if (!n || n === name || n.startsWith('..')) this.scheduleRefresh()
      })
      w.on('error', (err) => {
        this.say(
          'warn',
          `license: stopped watching ${dir} (${errText(err)}); a renewed license is still picked up within the hour`,
        )
        w.close()
        if (this.watcher === w) this.watcher = null
      })
      this.watcher = w
    } catch (err) {
      // A missing directory, or a filesystem without watch support: the hourly tick still re-reads.
      this.say(
        'info',
        `license: not watching ${dir} (${errText(err)}); a renewed license is picked up within the hour`,
      )
    }
  }

  private scheduleRefresh(): void {
    if (this.stopped) return
    if (this.debounce) clearTimeout(this.debounce)
    this.debounce = setTimeout(() => {
      this.debounce = null
      void this.refresh('file-change')
    }, this.opts.debounceMs ?? DEFAULT_DEBOUNCE_MS)
    this.debounce.unref()
  }

  private async evaluateOnce(reasons: ReadonlySet<string>): Promise<void> {
    try {
      const systemNow = this.now()
      let clock: ClockObservation = {
        effectiveNowMs: systemNow,
        maxSeenAtMs: systemNow,
        rollbackDetected: false,
      }
      if (this.opts.stateStore) {
        try {
          clock = await this.opts.stateStore.observe(systemNow)
        } catch (err) {
          this.say(
            'warn',
            `license: clock state unavailable (${errText(err)}); evaluating against the system clock, without rollback protection`,
          )
        }
      }
      if (clock.rollbackDetected) {
        const t = timeText
        this.say(
          'warn',
          `CLOCK_ROLLBACK_DETECTED: the system clock (${t(systemNow)}) is more than 24h behind the latest time this deployment has recorded (${t(clock.maxSeenAtMs)}), so the license is evaluated at ${t(clock.effectiveNowMs)}. If the recorded time is the wrong one (the clock once jumped forward), fix the clock, then delete the license_state row (DELETE FROM license_state) and restart.`,
          { code: 'CLOCK_ROLLBACK_DETECTED' },
        )
      }
      const usesFile = this.usesFile()
      const signature = usesFile ? fileSignature(this.opts.config.filePath) : null
      // Only a run nothing but the tick asked for: a change the watch caught is not the re-read's find.
      const tickOnly = reasons.size === 1 && reasons.has('tick')
      if (tickOnly && usesFile && this.evaluated && signature !== this.signature) {
        this.say(
          'info',
          `license: ${this.opts.config.filePath} changed since the last check; picked up by the hourly re-read`,
        )
      }
      this.signature = signature
      this.apply(
        evaluateLicense({
          source: readLicenseSource(this.opts.config),
          keyMap: this.keyMap,
          effectiveNowMs: clock.effectiveNowMs,
          evaluatedAtMs: systemNow,
          revocations: this.revocations,
          clockRollbackDetected: clock.rollbackDetected,
        }),
        reasons,
      )
    } catch (err) {
      this.say(
        'error',
        `license: evaluation failed (${errText(err)}); ${this.evaluated ? 'keeping the previous status' : 'running in community mode'}`,
      )
      if (!this.evaluated) this.apply(this.failed(), reasons)
    }
  }

  private failed(): LicenseStatus {
    let at: number
    try {
      at = this.now()
    } catch {
      at = Date.now() // a throwing clock seam must not stop the fallback itself
    }
    return communityStatus(
      {
        source: 'none',
        clockRollbackDetected: false,
        revocationList: this.revocations.status,
        evaluatedAt: isoOrNow(at),
      },
      'INVALID',
      'EVALUATION_FAILED',
    )
  }

  private apply(next: LicenseStatus, reasons: ReadonlySet<string>): void {
    const previous = this.status
    const fp = fingerprint(next)
    const changed = fp !== this.fp
    const first = !this.evaluated
    this.status = next
    this.ent = new EntitlementService(next)
    this.fp = fp
    this.evaluated = true
    const tick = reasons.has('tick')
    if (tick) this.ticks++
    const remind = tick && next.state !== 'VALID' && this.ticks % REMINDER_EVERY_TICKS === 0
    if (first || changed || remind) {
      const line = formatLicenseLogLine(next)
      this.say(line.level, line.message, line.fields)
      if (
        next.entitlementSource === 'license' &&
        (next.env === 'dev' || (next.kid !== undefined && isDevKid(next.kid)))
      ) {
        this.say(
          'warn',
          `license: this is a DEVELOPMENT license (env=${next.env ?? '?'}, kid=${next.kid ?? '?'}). It is not valid for production use.`,
          { license: { env: next.env, kid: next.kid } },
        )
      }
      if (next.shadowedFile) {
        this.say(
          'warn',
          `license: OPENSTEWARD_LICENSE is set, so ${next.shadowedFile} is ignored. If you renewed the license by replacing that file, unset OPENSTEWARD_LICENSE or put the new token in it.`,
          { license: { source: 'env', shadowedFile: next.shadowedFile } },
        )
      }
    }
    if (first) {
      if (this.devKeysTrusted) {
        this.say(
          'warn',
          'license: this build trusts development license keys (a source build, or an image built with OPENSTEWARD_BUILD_PROFILE=development). Production images never do.',
        )
      }
      if (next.revocationList !== 'ok') {
        this.say(
          'warn',
          `license: the revocation list shipped with this release is ${next.revocationList}${this.revocations.reason ? ` (${this.revocations.reason})` : ''}; revoked licenses cannot be detected. Startup continues.`,
        )
      }
    }
    if (changed && !first) {
      const listenerFailed = (err: unknown): void =>
        this.say('warn', `license: change listener failed (${errText(err)})`)
      for (const l of this.listeners) {
        try {
          const result: unknown = l(next, previous)
          // An async listener's rejection would otherwise be unhandled: a process exit under Node's default policy.
          if (typeof (result as PromiseLike<void> | undefined)?.then === 'function') {
            ;(result as PromiseLike<void>).then(undefined, listenerFailed)
          }
        } catch (err) {
          listenerFailed(err)
        }
      }
    }
  }
}
