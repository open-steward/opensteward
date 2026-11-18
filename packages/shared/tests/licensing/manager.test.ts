import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDb } from '../../src/db'
import {
  LicenseManager,
  type LicenseLogger,
  type LicenseManagerOptions,
} from '../../src/licensing/manager'
import { TOKEN_AS_FILE_PATH } from '../../src/licensing/source'
import { LicenseStateStore } from '../../src/licensing/state-store'
import { computeClock } from '../../src/licensing/time'
import {
  DAY,
  T0,
  iso,
  payload,
  productionTestKey,
  signLicense,
  signRevocations,
  tamper,
} from './helpers'

interface Line {
  level: 'info' | 'warn' | 'error'
  message: string
  fields?: Record<string, unknown>
}
let dir = ''
let file = ''
let lines: Line[] = []
const managers: LicenseManager[] = []
const logger: LicenseLogger = {
  info: (message, fields) => lines.push({ level: 'info', message, fields }),
  warn: (message, fields) => lines.push({ level: 'warn', message, fields }),
  error: (message, fields) => lines.push({ level: 'error', message, fields }),
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
/**
 * Repeat a filesystem change until the manager has seen it. fs.watch is live
 * only some time after watch() returns (on macOS, FSEvents starts its stream on
 * another thread), so a single change made right after start() can land before
 * the stream does and never be reported: that is how these tests failed about
 * one run in six under load (fix-round notes f9, f34). The hourly tick is an
 * hour away here, so only the watch can deliver the change.
 */
async function untilSeen(change: (attempt: number) => void, seen: () => void): Promise<void> {
  let attempt = 0
  change(attempt++)
  await vi.waitFor(
    () => {
      try {
        seen()
      } catch (err) {
        change(attempt++)
        throw err
      }
    },
    { timeout: 20_000, interval: 200 },
  )
}
/** Wait until `count` has not moved for `quietMs`: the watch's trailing events are done. */
async function settled(count: () => number, quietMs = 500): Promise<number> {
  for (;;) {
    const before = count()
    await sleep(quietMs)
    if (count() === before) return before
  }
}
async function manager(over: Partial<LicenseManagerOptions> = {}): Promise<LicenseManager> {
  const m = await LicenseManager.create({
    config: { filePath: file },
    now: () => T0,
    logger,
    watch: false,
    ...over,
  })
  managers.push(m)
  return m
}
const old = { iat: iso(T0 - 400 * DAY), nbf: iso(T0 - 400 * DAY) }

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'lic-mgr-'))
  file = join(dir, 'license.key')
  lines = []
})
afterEach(async () => {
  for (const m of managers.splice(0)) await m.stop()
  rmSync(dir, { recursive: true, force: true })
})

describe('LicenseManager', () => {
  it('MISSING: community entitlements, a warn naming the signup URL and the path, never a throw', async () => {
    const m = await manager()
    expect(m.current()).toMatchObject({
      state: 'MISSING',
      entitlementSource: 'community',
      filePath: file,
    })
    expect(m.entitlements().limit('connections')).toBe(1)
    expect(m.entitlements().has('sso')).toBe(false)
    const warn = lines.find((l) => l.message.startsWith('no license found'))
    expect(warn?.level).toBe('warn')
    expect(warn?.message).toContain('https://opensteward.dev/license')
    expect(warn?.message).toContain(file)
  })

  it('an env token wins over the file, and the shadowed file is named in a warning (Review Focus #2)', async () => {
    writeFileSync(file, signLicense(payload({ sub: 'lic_fromfile01', exp: iso(T0 + 400 * DAY) })))
    const envToken = signLicense(payload({ sub: 'lic_fromenv001', exp: iso(T0 + 20 * DAY) }))
    const m = await manager({ config: { envToken, filePath: file } })
    expect(m.current()).toMatchObject({
      source: 'env',
      licenseId: 'lic_fromenv001',
      state: 'EXPIRING',
      shadowedFile: file,
    })
    const warn = lines.find((l) => l.message.includes('OPENSTEWARD_LICENSE is set'))
    expect(warn?.level).toBe('warn')
    expect(warn?.message).toContain(file)
  })

  it('hot reload via refresh(): MISSING → VALID, onChange fires once with (next, previous)', async () => {
    const m = await manager()
    const seen: string[] = []
    m.onChange((next, previous) => seen.push(`${previous.state}->${next.state}`))
    writeFileSync(file, signLicense())
    await m.refresh()
    expect(m.current().state).toBe('VALID')
    expect(seen).toEqual(['MISSING->VALID'])
    await m.refresh()
    expect(seen).toHaveLength(1) // an unchanged evaluation does not re-fire
  })

  it('[L7:G11] the directory watch picks up a renewed file without a restart', async () => {
    writeFileSync(file, signLicense(payload({ sub: 'lic_first0001' })))
    await sleep(200) // let filesystem events from the setup settle before watching
    const m = await manager({ watch: true, debounceMs: 20 })
    m.start()
    await untilSeen(
      () => writeFileSync(file, signLicense(payload({ sub: 'lic_renewed01' }))),
      () => expect(m.current().licenseId).toBe('lic_renewed01'),
    )
  })

  it('[L7:G11] a Kubernetes Secret update (the ..data symlink swap) is picked up', async () => {
    mkdirSync(join(dir, '..v1'))
    writeFileSync(join(dir, '..v1', 'license.key'), signLicense(payload({ sub: 'lic_k8sfirst1' })))
    symlinkSync('..v1', join(dir, '..data'))
    symlinkSync(join('..data', 'license.key'), file)
    await sleep(200)
    const m = await manager({ watch: true, debounceMs: 20 })
    m.start()
    expect(m.current().licenseId).toBe('lic_k8sfirst1')
    // What the kubelet does: a new timestamped directory, then an atomic swap of ..data.
    await untilSeen(
      (attempt) => {
        const next = `..v${attempt + 2}`
        mkdirSync(join(dir, next))
        writeFileSync(
          join(dir, next, 'license.key'),
          signLicense(payload({ sub: 'lic_k8snext01' })),
        )
        symlinkSync(next, join(dir, '..data_tmp'))
        renameSync(join(dir, '..data_tmp'), join(dir, '..data'))
      },
      () => expect(m.current().licenseId).toBe('lic_k8snext01'),
    )
  })

  it('the watch ignores the rest of the directory: five writes to other.db, no observe (review #1)', async () => {
    writeFileSync(file, signLicense())
    await sleep(200)
    let observed = 0
    const stateStore = {
      observe: async (t: number) => {
        observed++
        return computeClock(t, null)
      },
    }
    const m = await manager({ watch: true, debounceMs: 20, stateStore })
    m.start()
    expect(observed).toBe(1)
    // The watch is live first, so the silence below is the filter, not a stream
    // that has not started yet; then its trailing events are let through.
    await untilSeen(
      () => writeFileSync(file, signLicense()),
      () => expect(observed).toBeGreaterThan(1),
    )
    const quiet = await settled(() => observed)
    for (let i = 0; i < 5; i++) {
      writeFileSync(join(dir, 'other.db'), `row ${i}`) // what SQLite's WAL next to the license file looks like
      await sleep(30)
    }
    await sleep(300)
    expect(observed).toBe(quiet)
  })

  it('a missing license directory: MISSING, and start() does not throw', async () => {
    const m = await manager({
      config: { filePath: join(dir, 'no-such-dir', 'license.key') },
      watch: true,
    })
    expect(() => m.start()).not.toThrow()
    expect(m.current().state).toBe('MISSING')
    expect(lines.some((l) => l.message.startsWith('license: not watching'))).toBe(true)
  })

  it('a clock rolled back across a restart is detected, and the license is evaluated at max_seen_at − 24 h', async () => {
    const handle = await openDb({ sqlitePath: ':memory:' })
    try {
      const stateStore = await LicenseStateStore.create(handle)
      const token = signLicense(payload({ exp: iso(T0 + 29 * DAY) })) // EXPIRING from T0 − 1 d on
      await manager({ stateStore, config: { envToken: token, filePath: file } }) // records T0
      const m2 = await manager({
        stateStore,
        now: () => T0 - 3 * DAY,
        config: { envToken: token, filePath: file },
      })
      // Believed, T0 − 3 d would be before nbf (T0 − 1 d): INVALID/NOT_YET_VALID. Clamped to T0 − 1 d it is EXPIRING.
      expect(m2.current()).toMatchObject({ state: 'EXPIRING', clockRollbackDetected: true })
      expect(lines.some((l) => l.message.startsWith('CLOCK_ROLLBACK_DETECTED'))).toBe(true)
    } finally {
      await handle.close()
    }
  })

  it('a forward clock spike: DEGRADED, flagged, and the log names the remedy (Review Focus #3)', async () => {
    const handle = await openDb({ sqlitePath: ':memory:' })
    try {
      const stateStore = await LicenseStateStore.create(handle)
      await stateStore.observe(T0 + 400 * DAY) // one boot with a bad clock
      const m = await manager({
        stateStore,
        config: { envToken: signLicense(payload({ exp: iso(T0 + 300 * DAY) })), filePath: file },
      })
      expect(m.current()).toMatchObject({ state: 'DEGRADED', clockRollbackDetected: true })
      const line = lines.find((l) => l.message.startsWith('CLOCK_ROLLBACK_DETECTED'))
      expect(line?.message).toMatch(/fix the clock, then delete the license_state row/)
    } finally {
      await handle.close()
    }
  })

  it('a failing clock store: the system clock, with a warning, never a throw', async () => {
    const stateStore = { observe: async () => Promise.reject(new Error('db down')) }
    const m = await manager({ stateStore, config: { envToken: signLicense(), filePath: file } })
    expect(m.current().state).toBe('VALID')
    expect(lines.some((l) => l.level === 'warn' && l.message.includes('db down'))).toBe(true)
  })

  it('[L7:V05] includeDevKeys:false: a dev token is INVALID/UNKNOWN_KID, and no dev-keys warning', async () => {
    const m = await manager({
      includeDevKeys: false,
      config: { envToken: signLicense(), filePath: file },
    })
    expect(m.current()).toMatchObject({ state: 'INVALID', reason: 'UNKNOWN_KID' })
    expect(lines.some((l) => l.message.includes('trusts development license keys'))).toBe(false)
  })

  it('[L7:V16] a dev license warns loudly, and so does a build that trusts dev keys', async () => {
    await manager({ config: { envToken: signLicense(), filePath: file } })
    expect(lines.some((l) => l.level === 'warn' && l.message.includes('DEVELOPMENT license'))).toBe(
      true,
    )
    expect(
      lines.some(
        (l) => l.level === 'warn' && l.message.includes('trusts development license keys'),
      ),
    ).toBe(true)
  })

  it('the token never reaches a log line, in any state', async () => {
    const cases: Array<[string, string | undefined]> = [
      ['VALID', signLicense()],
      ['EXPIRING', signLicense(payload({ exp: iso(T0 + 10 * DAY) }))],
      ['GRACE', signLicense(payload({ ...old, exp: iso(T0 - 10 * DAY) }))],
      ['DEGRADED', signLicense(payload({ ...old, exp: iso(T0 - 40 * DAY) }))],
      ['INVALID', tamper(signLicense())],
      ['MISSING', undefined],
    ]
    for (const [state, token] of cases) {
      lines = []
      const m = await manager({ config: { envToken: token, filePath: file } })
      expect(m.current().state, state).toBe(state)
      expect(lines.length, state).toBeGreaterThan(0)
      const logged = JSON.stringify(lines)
      if (token) {
        expect(logged, state).not.toContain(token)
        expect(logged, state).not.toContain(token.slice(10, 50))
      }
    }
  })

  it('a token used as a directory in the path is never watched, signed or named in a log line (review r8)', async () => {
    const seg = `v4.public.${'eyJhdWQiOiJvcGVuc3Rld2FyZCJ9'.repeat(2)}`
    // Missing: a watch on it would fail, and the failure line would name the directory.
    const missing = await manager({
      config: { filePath: join(dir, 'gone', seg, 'license.key') },
      watch: true,
    })
    missing.start()
    // Present, and changed before the hourly re-read: a signed file would be named as changed.
    const present = join(dir, seg, 'license.key')
    mkdirSync(join(dir, seg))
    writeFileSync(present, signLicense(payload({ sub: 'lic_first0001' })))
    const m = await manager({ config: { filePath: present } })
    writeFileSync(present, signLicense(payload({ sub: 'lic_second001' })))
    await m.refresh('tick')
    for (const s of [missing, m]) {
      expect(s.current()).toMatchObject({
        state: 'INVALID',
        reason: 'FILE_UNREADABLE',
        filePath: TOKEN_AS_FILE_PATH,
      })
    }
    expect(lines.length).toBeGreaterThan(0)
    expect(JSON.stringify(lines)).not.toContain(seg)
  })

  it('the hourly re-read notices a file change the watch missed (mtime + hash)', async () => {
    writeFileSync(file, signLicense(payload({ sub: 'lic_first0001' })))
    const m = await manager({ tickIntervalMs: 20 })
    m.start()
    writeFileSync(file, signLicense(payload({ sub: 'lic_second001' })))
    await vi.waitFor(() => expect(m.current().licenseId).toBe('lic_second001'), {
      timeout: 5000,
      interval: 20,
    })
    expect(lines.some((l) => l.message.includes('changed since the last check'))).toBe(true)
  })

  it('stop() halts the tick', async () => {
    let n = 0
    const stateStore = {
      observe: async (t: number) => {
        n++
        return computeClock(t, null)
      },
    }
    const m = await manager({ tickIntervalMs: 10, stateStore })
    m.start()
    await sleep(80)
    await m.stop()
    const after = n
    await sleep(80)
    expect(n).toBe(after)
    expect(after).toBeGreaterThan(1)
  })

  it('[L7:V15] a missing revocation list warns once at startup and never blocks', async () => {
    // The shipped list exists since A3.9, so inject a release without one.
    vi.resetModules()
    vi.doMock('../../src/licensing/revocations', () => ({ REVOCATION_LIST_TOKEN: null }))
    try {
      const { LicenseManager: Fresh } = await import('../../src/licensing/manager')
      const m = await Fresh.create({
        config: { envToken: signLicense(), filePath: file },
        now: () => T0,
        logger,
        watch: false,
      })
      managers.push(m)
      await m.refresh()
      expect(m.current()).toMatchObject({ state: 'VALID', revocationList: 'missing' })
      expect(lines.filter((l) => l.message.includes('revocation list')).length).toBe(1)
    } finally {
      vi.doUnmock('../../src/licensing/revocations')
      vi.resetModules()
    }
  })

  it('[L7:V15] an invalid shipped revocation list warns and never blocks', async () => {
    vi.resetModules()
    vi.doMock('../../src/licensing/revocations', () => ({
      REVOCATION_LIST_TOKEN: 'v4.public.not-a-list',
    }))
    try {
      const { LicenseManager: Fresh } = await import('../../src/licensing/manager')
      const m = await Fresh.create({
        config: { envToken: signLicense(), filePath: file },
        now: () => T0,
        logger,
        watch: false,
      })
      managers.push(m)
      expect(m.current()).toMatchObject({ state: 'VALID', revocationList: 'invalid' })
      expect(lines.filter((l) => l.message.includes('revocation list')).length).toBe(1)
    } finally {
      vi.doUnmock('../../src/licensing/revocations')
      vi.resetModules()
    }
  })

  it('[L7:V14] a shipped list signed by a production kid revokes through the manager: the listed sub is INVALID/REVOKED, another stays VALID', async () => {
    // The path production takes once A3.9 ships keys and a list: the constant is
    // verified against this build's key ring in the constructor and its set
    // reaches every evaluation. A manager that dropped the set, or verified the
    // list against the wrong keys, would still say revocationList 'ok' elsewhere.
    const k = productionTestKey('k2026a')
    vi.resetModules()
    vi.doMock('../../src/licensing/keys.production', () => ({
      PRODUCTION_KIDS: ['k2026a'],
      PRODUCTION_KEYS: Object.freeze({ k2026a: k.publicKey }),
    }))
    vi.doMock('../../src/licensing/revocations', () => ({
      REVOCATION_LIST_TOKEN: signRevocations(['lic_revoked01'], k),
    }))
    try {
      const { LicenseManager: Fresh } = await import('../../src/licensing/manager')
      const create = async (sub: string) => {
        const m = await Fresh.create({
          config: { envToken: signLicense(payload({ sub, env: 'prod' }), k), filePath: file },
          now: () => T0,
          logger,
          watch: false,
        })
        managers.push(m)
        return m
      }
      const revoked = await create('lic_revoked01')
      expect(revoked.current()).toMatchObject({
        state: 'INVALID',
        reason: 'REVOKED',
        entitlementSource: 'community',
        revocationList: 'ok',
        kid: 'k2026a',
      })
      expect(revoked.entitlements().limit('connections')).toBe(1)
      const other = await create('lic_notlisted1')
      expect(other.current()).toMatchObject({
        state: 'VALID',
        revocationList: 'ok',
        kid: 'k2026a',
      })
    } finally {
      vi.doUnmock('../../src/licensing/keys.production')
      vi.doUnmock('../../src/licensing/revocations')
      vi.resetModules()
    }
  })
})

describe('LicenseManager: reminders, coalesced refreshes and failing collaborators', () => {
  const EXPIRING = () => signLicense(payload({ exp: iso(T0 + 10 * DAY) }))
  const linesOf = (prefix: string) => lines.filter((l) => l.message.startsWith(prefix)).length
  async function ticks(m: LicenseManager, n: number): Promise<void> {
    for (let i = 0; i < n; i++) await m.refresh('tick')
  }
  /** A clock store whose next observe() waits until release(): holds a run open so another refresh() lands in it. */
  function gatedClock() {
    let hold: Promise<void> | null = null
    let open = () => {}
    return {
      stateStore: {
        observe: async (t: number) => {
          if (hold) await hold
          return computeClock(t, null)
        },
      },
      block() {
        hold = new Promise<void>((resolve) => {
          open = () => {
            hold = null
            resolve()
          }
        })
      },
      release: () => open(),
    }
  }

  it('a non-VALID state repeats its line about once a day: every 24th hourly tick (review m31)', async () => {
    const m = await manager({ config: { envToken: EXPIRING(), filePath: file } })
    expect(linesOf('license EXPIRING')).toBe(1) // startup
    await ticks(m, 23)
    expect(linesOf('license EXPIRING')).toBe(1)
    await ticks(m, 1)
    expect(linesOf('license EXPIRING')).toBe(2)
    await ticks(m, 24)
    expect(linesOf('license EXPIRING')).toBe(3)
  })

  it('VALID is not repeated: it logs once and stays quiet', async () => {
    const m = await manager({ config: { envToken: signLicense(), filePath: file } })
    await ticks(m, 48)
    expect(linesOf('license VALID')).toBe(1)
  })

  it('a refresh that is not a tick never counts toward the reminder', async () => {
    const m = await manager({ config: { envToken: EXPIRING(), filePath: file } })
    for (let i = 0; i < 30; i++) await m.refresh('file-change')
    await m.refresh()
    expect(linesOf('license EXPIRING')).toBe(1)
  })

  it('a tick that lands during a file-change run is still counted (review m33)', async () => {
    const clock = gatedClock()
    const m = await manager({
      stateStore: clock.stateStore,
      config: { envToken: EXPIRING(), filePath: file },
    })
    await ticks(m, 23)
    clock.block()
    const change = m.refresh('file-change')
    const tick = m.refresh('tick') // the 24th, coalesced into the re-run
    clock.release()
    await Promise.all([change, tick])
    expect(linesOf('license EXPIRING')).toBe(2)
  })

  it('a file change that lands during a tick does not count as a second tick (review m33)', async () => {
    const clock = gatedClock()
    const m = await manager({
      stateStore: clock.stateStore,
      config: { envToken: EXPIRING(), filePath: file },
    })
    await ticks(m, 22)
    clock.block()
    const tick = m.refresh('tick') // the 23rd
    const change = m.refresh('file-change')
    clock.release()
    await Promise.all([tick, change])
    expect(linesOf('license EXPIRING')).toBe(1)
    await ticks(m, 1) // the 24th
    expect(linesOf('license EXPIRING')).toBe(2)
  })

  it('a file change the watch caught during a tick is not reported as the hourly re-read finding it (review m33)', async () => {
    writeFileSync(file, signLicense(payload({ sub: 'lic_first0001', exp: iso(T0 + 40 * DAY) })))
    let now = T0
    // A clock store, as in production: the run awaits it first, so a refresh()
    // from inside the run joins it instead of starting a run of its own.
    const stateStore = { observe: async (t: number) => computeClock(t, null) }
    const m = await manager({ now: () => now, stateStore })
    expect(m.current().state).toBe('VALID')
    let tickRun: Promise<unknown> | undefined
    let joined = false
    let fired = false
    m.onChange(() => {
      if (fired) return
      fired = true
      // The renewed file lands mid-tick, and the watch asks for a refresh.
      writeFileSync(file, signLicense(payload({ sub: 'lic_renewed01', exp: iso(T0 + 400 * DAY) })))
      joined = m.refresh('file-change') === tickRun
    })
    now = T0 + 15 * DAY // VALID → EXPIRING: the tick's own run changes the status
    tickRun = m.refresh('tick')
    await tickRun
    expect(joined).toBe(true) // coalesced into the tick's run, not a run of its own
    expect(m.current().licenseId).toBe('lic_renewed01')
    expect(lines.some((l) => l.message.includes('picked up by the hourly re-read'))).toBe(false)
  })

  it('a throwing logger never escapes create(), refresh(), a file-change or tick refresh, or start() (review m32)', async () => {
    const throwing: LicenseLogger = {
      info: () => {
        throw new Error('logger down')
      },
      warn: () => {
        throw new Error('logger down')
      },
      error: () => {
        throw new Error('logger down')
      },
    }
    // Every path logs: MISSING warns, the dev-key build warns, a failed clock store warns.
    const stateStore = { observe: async () => Promise.reject(new Error('db down')) }
    const m = await manager({ logger: throwing, stateStore })
    expect(m.current().state).toBe('MISSING')
    writeFileSync(file, tamper(signLicense()))
    await expect(m.refresh()).resolves.toMatchObject({ state: 'INVALID' })
    // The refresh the watch schedules, called directly: the logger is what is
    // under test here, not fs.watch's timing (f34; the watch has its own tests).
    writeFileSync(file, signLicense(payload({ sub: 'lic_watched01' })))
    await expect(m.refresh('file-change')).resolves.toMatchObject({ licenseId: 'lic_watched01' })
    // The hourly re-read logs the change it finds.
    writeFileSync(file, signLicense(payload({ sub: 'lic_ticked001' })))
    await expect(m.refresh('tick')).resolves.toMatchObject({ licenseId: 'lic_ticked001' })
    // start() logs when it cannot watch (here, a missing directory).
    const unwatched = await manager({
      logger: throwing,
      stateStore,
      watch: true,
      config: { filePath: join(dir, 'gone', 'license.key') },
    })
    expect(() => unwatched.start()).not.toThrow()
  })

  it('an async listener that rejects is logged like a throwing one, never left unhandled (review m35)', async () => {
    const m = await manager()
    m.onChange(async () => {
      await Promise.resolve()
      throw new Error('listener boom')
    })
    writeFileSync(file, signLicense())
    await m.refresh()
    await vi.waitFor(() =>
      expect(lines.some((l) => l.level === 'warn' && l.message.includes('listener boom'))).toBe(
        true,
      ),
    )
  })

  it('a max_seen_at outside the Date range still logs the rollback line with its remedy (review m34)', async () => {
    const stateStore = {
      observe: async (t: number) => ({
        effectiveNowMs: t,
        maxSeenAtMs: 9e15,
        rollbackDetected: true,
      }),
    }
    const m = await manager({ stateStore, config: { envToken: signLicense(), filePath: file } })
    expect(m.current()).toMatchObject({ state: 'VALID', clockRollbackDetected: true })
    const line = lines.find((l) => l.message.startsWith('CLOCK_ROLLBACK_DETECTED'))
    expect(line?.message).toContain('9000000000000000 ms (not a valid time)')
    expect(line?.message).toMatch(/delete the license_state row/)
  })

  it('that corrupted max_seen_at through the real store: the remedy is logged, and community mode blames no token (review m34)', async () => {
    const handle = await openDb({ sqlitePath: ':memory:' })
    try {
      const stateStore = await LicenseStateStore.create(handle)
      await stateStore.observe(9e15) // a hand-edited row: the store then evaluates at 9e15 − 24 h
      const m = await manager({ stateStore, config: { envToken: signLicense(), filePath: file } })
      expect(m.current()).toMatchObject({
        state: 'INVALID',
        reason: 'EVALUATION_FAILED',
        entitlementSource: 'community',
        clockRollbackDetected: true,
      })
      const line = lines.find((l) => l.message.startsWith('CLOCK_ROLLBACK_DETECTED'))
      expect(line?.message).toContain(`evaluated at ${9e15 - DAY} ms (not a valid time)`)
      expect(line?.message).toMatch(/delete the license_state row/)
    } finally {
      await handle.close()
    }
  })

  it.each([
    ['outside the Date range', () => 9e15],
    [
      'throwing',
      (): number => {
        throw new Error('no clock')
      },
    ],
  ])('a clock seam %s: create() still resolves, in community mode', async (_label, now) => {
    const m = await manager({ now })
    expect(m.current()).toMatchObject({
      state: 'INVALID',
      reason: 'EVALUATION_FAILED',
      entitlementSource: 'community',
    })
    expect(Number.isNaN(Date.parse(m.current().evaluatedAt))).toBe(false)
  })
})
