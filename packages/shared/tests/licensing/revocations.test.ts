import { describe, expect, it } from 'vitest'
import { verifyRevocationList } from '@opensteward/license-token'
import { PRODUCTION_KEYS } from '../../src/licensing/keys.production'
import { REVOCATION_LIST_TOKEN } from '../../src/licensing/revocations'
import { loadRevocations } from '../../src/licensing/revocation-state'
import {
  DEV_KEYMAP,
  DEV_SIGNER,
  payload,
  productionTestKey,
  signLicense,
  signRevocations,
} from './helpers'

describe('the shipped revocation list [L7:V15]', () => {
  it('is the list the license service issued (A3.9): k2026a signed it, and it revokes nothing', () => {
    expect(typeof REVOCATION_LIST_TOKEN).toBe('string')
    // Only k2026a in the key map: the list must verify under that kid alone.
    const keyMap = Object.freeze({ k2026a: PRODUCTION_KEYS.k2026a })
    const verdict = verifyRevocationList(REVOCATION_LIST_TOKEN!, keyMap)
    expect(verdict).toMatchObject({ ok: true, kid: 'k2026a' })
    const r = loadRevocations(REVOCATION_LIST_TOKEN, keyMap)
    expect(r.status).toBe('ok')
    expect([...r.revoked]).toEqual([])
  })
  it('missing: a warning, never a blocked start', () => {
    expect(loadRevocations(null, DEV_KEYMAP)).toMatchObject({ status: 'missing' })
  })
  it('garbage is invalid, without throwing', () => {
    expect(loadRevocations('nope', DEV_KEYMAP)).toMatchObject({ status: 'invalid' })
  })
  it('ok, as a set of ids, when a production kid signed it', () => {
    const k = productionTestKey('r2026a')
    const r = loadRevocations(signRevocations(['lic_aaaaaa', 'lic_bbbbbb'], k), k.keyMap)
    expect(r.status).toBe('ok')
    expect([...r.revoked].sort()).toEqual(['lic_aaaaaa', 'lic_bbbbbb'])
    expect(r.issuedAt).toBeDefined()
  })
  it('a license token is never a revocation list: the revocations assertion does not verify it', () => {
    const k = productionTestKey()
    expect(loadRevocations(signLicense(payload({ env: 'prod' }), k), k.keyMap)).toMatchObject({
      status: 'invalid',
      reason: 'BAD_SIGNATURE',
    })
  })
  it('a dev-signed list proves nothing (the dev1 private key is public)', () => {
    const r = loadRevocations(signRevocations(['lic_aaaaaa'], DEV_SIGNER), DEV_KEYMAP)
    expect(r).toMatchObject({ status: 'invalid', reason: 'DEV_KID_SIGNER' })
    expect(r.revoked.size).toBe(0)
  })
  it('a list signed by a key this build does not trust is invalid', () => {
    const signer = productionTestKey()
    const other = productionTestKey()
    expect(loadRevocations(signRevocations(['lic_aaaaaa'], signer), other.keyMap)).toMatchObject({
      status: 'invalid',
      reason: 'BAD_SIGNATURE',
    })
  })
})
