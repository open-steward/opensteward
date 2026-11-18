import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { inspectLicense } from '../../src/licensing/inspect'
import {
  DAY,
  DEV_KEYMAP,
  DEV_KID,
  T0,
  payload,
  productionTestKey,
  signLicense,
  signRevocations,
} from './helpers'

let dir = ''
let file = ''
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'lic-inspect-'))
  file = join(dir, 'license.key')
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('inspectLicense (doctor; no store, no watcher, no timer)', () => {
  it('evaluates the configured license as the server would', () => {
    writeFileSync(file, `${signLicense()}\n`)
    expect(
      inspectLicense({ config: { filePath: file }, now: T0, keyMap: DEV_KEYMAP }),
    ).toMatchObject({
      state: 'VALID',
      source: 'file',
      filePath: file,
      kid: DEV_KID,
      productionKid: false,
    })
  })
  it('productionKid is true only for a production kid', () => {
    const k = productionTestKey()
    writeFileSync(file, signLicense(payload({ env: 'prod' }), k))
    expect(inspectLicense({ config: { filePath: file }, now: T0, keyMap: k.keyMap })).toMatchObject(
      { state: 'VALID', kid: 'k2026a', productionKid: true },
    )
    expect(
      inspectLicense({ config: { filePath: file }, now: T0, keyMap: k.keyMap, productionKids: [] })
        .productionKid,
    ).toBe(false)
  })
  it('reports an env token shadowing a file, for doctor to warn about (Review Focus #2)', () => {
    writeFileSync(file, signLicense())
    expect(
      inspectLicense({
        config: { envToken: signLicense(), filePath: file },
        now: T0,
        keyMap: DEV_KEYMAP,
      }),
    ).toMatchObject({ source: 'env', shadowedFile: file })
  })
  it("uses this build's key ring by default (a source build trusts the dev key)", () => {
    writeFileSync(file, signLicense())
    expect(inspectLicense({ config: { filePath: file }, now: T0 })).toMatchObject({
      state: 'VALID',
      kid: DEV_KID,
    })
  })
  it('honours `now` (no clock store): past the grace period is DEGRADED', () => {
    writeFileSync(file, signLicense())
    expect(
      inspectLicense({ config: { filePath: file }, now: T0 + 400 * DAY, keyMap: DEV_KEYMAP }).state,
    ).toBe('DEGRADED')
  })
  it('[L7:V14] applies the shipped revocation list, verified against the key ring it evaluates with', async () => {
    // What doctor reports: the listed sub is REVOKED with the list 'ok', and a
    // sub the list does not name stays VALID. Both with this build's key ring
    // (the default) and with a key map passed in.
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
      const { inspectLicense: fresh } = await import('../../src/licensing/inspect')
      const at = (sub: string) => {
        writeFileSync(file, signLicense(payload({ sub, env: 'prod' }), k))
        return [
          fresh({ config: { filePath: file }, now: T0 }),
          fresh({ config: { filePath: file }, now: T0, keyMap: k.keyMap }),
        ]
      }
      for (const status of at('lic_revoked01')) {
        expect(status).toMatchObject({
          state: 'INVALID',
          reason: 'REVOKED',
          entitlementSource: 'community',
          revocationList: 'ok',
          kid: 'k2026a',
          productionKid: true,
        })
      }
      for (const status of at('lic_notlisted1')) {
        expect(status).toMatchObject({ state: 'VALID', revocationList: 'ok', kid: 'k2026a' })
      }
    } finally {
      vi.doUnmock('../../src/licensing/keys.production')
      vi.doUnmock('../../src/licensing/revocations')
      vi.resetModules()
    }
  })
  it('never throws', () => {
    expect(inspectLicense({ config: { filePath: '/tmp/a\0b' }, now: T0 })).toMatchObject({
      state: 'INVALID',
      reason: 'FILE_UNREADABLE',
    })
    expect(inspectLicense({ config: { filePath: file }, now: Number.NaN })).toMatchObject({
      state: 'INVALID',
      reason: 'EVALUATION_FAILED',
      productionKid: false,
    })
  })
})
