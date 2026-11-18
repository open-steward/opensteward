import { generateKeyPairSync } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { importPublicKey, publicKeyFromSpkiDer } from '../src/keys'

const SPKI_PREFIX = '302a300506032b6570032100' // AWS KMS GetPublicKey: 12-byte header + 32-byte key
const VECTOR_PK = '1eb9dbbbbc047c03fd70604e0071f0987e16b28b757225c11f00415d0e20b1a2' // 4-S-1
const b64 = (hex: string) => Buffer.from(hex, 'hex').toString('base64url')

describe('importPublicKey', () => {
  it('imports raw 32-byte base64url as an Ed25519 public KeyObject', () => {
    const key = importPublicKey(b64(VECTOR_PK))
    expect([key.type, key.asymmetricKeyType]).toEqual(['public', 'ed25519'])
  })
  it.each([
    ['31 bytes', Buffer.alloc(31, 1).toString('base64url')],
    ['33 bytes', Buffer.alloc(33, 1).toString('base64url')],
    ['standard base64 with padding', Buffer.from(VECTOR_PK, 'hex').toString('base64')],
    ['empty', ''],
    ['a placeholder', 'PLACEHOLDER:k2026a'],
    ['all-zero bytes', Buffer.alloc(32).toString('base64url')],
    ['the identity point', Buffer.concat([Buffer.of(1), Buffer.alloc(31)]).toString('base64url')],
  ])('refuses %s', (_label, value) => expect(() => importPublicKey(value)).toThrow(TypeError))
})

describe('publicKeyFromSpkiDer (KMS GetPublicKey to key map entry)', () => {
  it('extracts the raw key from KMS-shaped SPKI DER', () =>
    expect(publicKeyFromSpkiDer(Buffer.from(SPKI_PREFIX + VECTOR_PK, 'hex'))).toBe(b64(VECTOR_PK)))
  it('agrees with node for a generated key', () => {
    const { publicKey } = generateKeyPairSync('ed25519')
    const der = publicKey.export({ format: 'der', type: 'spki' })
    expect(der.subarray(0, 12).toString('hex')).toBe(SPKI_PREFIX)
    expect(publicKeyFromSpkiDer(der)).toBe(publicKey.export({ format: 'jwk' }).x)
  })
  it('refuses a P-256 key', () => {
    const { publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
    expect(() => publicKeyFromSpkiDer(publicKey.export({ format: 'der', type: 'spki' }))).toThrow(
      /Ed25519/,
    )
  })
  it('refuses garbage', () => expect(() => publicKeyFromSpkiDer(Uint8Array.of(1, 2, 3))).toThrow())
})
