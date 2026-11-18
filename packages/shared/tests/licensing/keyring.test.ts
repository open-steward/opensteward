import { describe, expect, it } from 'vitest'
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { verifyLicense } from '@opensteward/license-token'
import { PRODUCTION_KEYS, PRODUCTION_KIDS } from '../../src/licensing/keys.production'
import { DEV_KEYS } from '../../src/licensing/keys.dev'
import { devKeysPresent, getKeyring, isDevKid } from '../../src/licensing/keyring'
import { DEV1_PUBLIC_KEY, DEV_KID, DEV_SIGNER, T0, payload, signLicense } from './helpers'

type KeyringModule = typeof import('../../src/licensing/keyring')
const SRC = join(__dirname, '../../src/licensing')
const FIVE = ['k2026a', 'k2026b', 'k2026c', 'r2026a', 'r2026b']

/** keyring.ts + keys.production.ts copied into a fresh `licensing/` dir: a build without keys.dev. */
async function isolatedKeyring(keysDevSource?: string): Promise<KeyringModule> {
  const dir = join(mkdtempSync(join(tmpdir(), 'keyring-')), 'licensing')
  mkdirSync(dir)
  for (const f of ['keyring.ts', 'keys.production.ts']) copyFileSync(join(SRC, f), join(dir, f))
  if (keysDevSource !== undefined) writeFileSync(join(dir, 'keys.dev.ts'), keysDevSource)
  return (await import(join(dir, 'keyring.ts'))) as KeyringModule
}

describe('production key map', () => {
  it('embeds exactly the five production kids', () => {
    expect(Object.keys(PRODUCTION_KEYS).sort()).toEqual(FIVE)
    expect([...PRODUCTION_KIDS].sort()).toEqual(FIVE)
  })
  it('each value is PLACEHOLDER:<its kid> or a 32-byte base64url key', () => {
    for (const [kid, value] of Object.entries(PRODUCTION_KEYS)) {
      if (value.startsWith('PLACEHOLDER:')) expect(value).toBe(`PLACEHOLDER:${kid}`)
      else expect(Buffer.from(value, 'base64url')).toHaveLength(32)
    }
  })
  it('no production key is a dev key', () => {
    const dev = new Set(Object.values(DEV_KEYS))
    expect(Object.values(PRODUCTION_KEYS).filter((v) => dev.has(v))).toEqual([])
  })
})

describe('dev key map', () => {
  it('holds only dev kids, one of them the committed test keypair', () => {
    expect(Object.keys(DEV_KEYS).length).toBeGreaterThan(0)
    expect(Object.keys(DEV_KEYS).every(isDevKid)).toBe(true)
    expect((DEV_KEYS as Record<string, string>)[DEV_KID]).toBe(DEV1_PUBLIC_KEY)
  })
})

describe('getKeyring in a source build (keys.dev present)', () => {
  it('returns PRODUCTION_KEYS verbatim, placeholders included, plus exactly the dev kids', () => {
    const ring = getKeyring()
    for (const [kid, value] of Object.entries(PRODUCTION_KEYS)) expect(ring[kid]).toBe(value)
    expect(Object.keys(ring).filter(isDevKid).sort()).toEqual(Object.keys(DEV_KEYS).sort())
    expect(devKeysPresent()).toBe(true)
  })

  it('[L7:V05] includeDevKeys:false removes the dev kids, so a dev1 token is UNKNOWN_KID', () => {
    const ring = getKeyring({ includeDevKeys: false })
    expect(Object.keys(ring).sort()).toEqual(FIVE)
    const token = signLicense()
    expect(verifyLicense(token, ring, new Date(T0))).toMatchObject({
      ok: false,
      reason: 'UNKNOWN_KID',
    })
    expect(verifyLicense(token, getKeyring(), new Date(T0))).toMatchObject({
      ok: true,
      kid: DEV_KID,
    })
  })

  it('a placeholder value fails as BAD_KEY at verify time, never a throw', () => {
    const token = signLicense(payload({ env: 'prod' }), {
      kid: 'k2026a',
      privateKey: DEV_SIGNER.privateKey,
    })
    expect(() => verifyLicense(token, { k2026a: 'PLACEHOLDER:k2026a' }, new Date(T0))).not.toThrow()
    expect(verifyLicense(token, { k2026a: 'PLACEHOLDER:k2026a' }, new Date(T0))).toMatchObject({
      ok: false,
      reason: 'BAD_KEY',
    })
  })

  it('is frozen', () => {
    expect(Object.isFrozen(getKeyring())).toBe(true)
    expect(Object.isFrozen(getKeyring({ includeDevKeys: false }))).toBe(true)
  })

  it('isDevKid is the prefix rule, not a list', () => {
    expect(isDevKid(DEV_KID)).toBe(true)
    expect(isDevKid('devk9')).toBe(true)
    expect(PRODUCTION_KIDS.some(isDevKid)).toBe(false)
  })
})

describe('a build without keys.dev (what a production image is)', () => {
  it('trusts exactly the five production kids, with or without includeDevKeys', async () => {
    const m = await isolatedKeyring()
    expect(Object.keys(m.getKeyring()).sort()).toEqual(FIVE)
    expect(Object.keys(m.getKeyring({ includeDevKeys: false })).sort()).toEqual(FIVE)
    expect(m.devKeysPresent()).toBe(false)
  })

  it('takes only dev kids from a keys.dev module: never a new or replaced production kid', async () => {
    const m = await isolatedKeyring(
      "export const DEV_KEYS = { dev9: 'AAAA', k2026a: 'BBBB', rogue: 'CCCC' }\n",
    )
    const ring = m.getKeyring()
    expect(ring['dev9']).toBe('AAAA')
    expect(ring['k2026a']).toBe(PRODUCTION_KEYS.k2026a)
    expect(ring).not.toHaveProperty('rogue')
  })
})

describe('no bypass (P1)', () => {
  it('nothing under licensing/ reads the environment', () => {
    for (const f of readdirSync(SRC).filter((n) => n.endsWith('.ts'))) {
      expect(readFileSync(join(SRC, f), 'utf8'), f).not.toMatch(/process\.env|NODE_ENV/)
    }
  })
})
