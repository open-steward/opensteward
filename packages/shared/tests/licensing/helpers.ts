/**
 * Signing helpers for the shared licensing tests. dev1 is the committed, public
 * test keypair (A1.6). Production kids are fresh keypairs made per run, so no
 * test ever needs a real production key.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createPrivateKey, generateKeyPairSync, sign, type KeyObject } from 'node:crypto'
import {
  LICENSE_AUDIENCE,
  LICENSE_ISSUER,
  assembleToken,
  buildSigningInput,
  toClaimTime,
  type KeyMap,
  type LicensePayload,
  type RevocationPayload,
} from '@opensteward/license-token'

interface DevKeyFile {
  kid: string
  publicKey: string
  privateKeyJwk: { kty: string; crv: string; x: string; d: string }
}
const FIXTURE = JSON.parse(
  readFileSync(join(__dirname, '..', '..', '..', 'license-token', 'fixtures', 'dev1.json'), 'utf8'),
) as DevKeyFile

export interface Signer {
  kid: string
  privateKey: KeyObject
  publicKey: string
  keyMap: KeyMap
}

export const DEV_SIGNER: Signer = {
  kid: FIXTURE.kid,
  privateKey: createPrivateKey({ key: FIXTURE.privateKeyJwk, format: 'jwk' }),
  publicKey: FIXTURE.publicKey,
  keyMap: Object.freeze({ [FIXTURE.kid]: FIXTURE.publicKey }),
}
export const DEV_KID = FIXTURE.kid
export const DEV1_PUBLIC_KEY = FIXTURE.publicKey
export const DEV_KEYMAP: KeyMap = DEV_SIGNER.keyMap

/** A fresh Ed25519 keypair standing in for a production kid. */
export function productionTestKey(kid = 'k2026a'): Signer {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519')
  const x = publicKey.export({ format: 'jwk' }).x as string
  return { kid, privateKey, publicKey: x, keyMap: Object.freeze({ [kid]: x }) }
}

export const DAY = 86_400_000
export const T0 = Date.parse('2026-10-09T12:00:00.000Z')
export const iso = (ms: number): string => toClaimTime(new Date(ms))

export function payload(over: Partial<LicensePayload> = {}): LicensePayload {
  return {
    iss: LICENSE_ISSUER,
    aud: LICENSE_AUDIENCE,
    sub: 'lic_test0001',
    org: 'Acme Forsakring AB',
    tier: 'free',
    features: ['mcp', 'vertical:accounting', 'vertical:crm'],
    limits: { connections: 5, tenants: 1 },
    label: 'production',
    env: 'dev',
    iat: iso(T0 - DAY),
    nbf: iso(T0 - DAY),
    exp: iso(T0 + 365 * DAY),
    ver: 1,
    ...over,
  }
}

export function signLicense(
  p: LicensePayload = payload(),
  signer: Pick<Signer, 'kid' | 'privateKey'> = DEV_SIGNER,
): string {
  const footer = { kid: signer.kid }
  const sig = sign(null, buildSigningInput(p, footer), signer.privateKey)
  return assembleToken(p, footer, new Uint8Array(sig))
}

export function signRevocations(
  revoked: string[],
  signer: Pick<Signer, 'kid' | 'privateKey'>,
): string {
  const p: RevocationPayload = { ver: 1, iat: iso(T0), revoked }
  const footer = { kid: signer.kid }
  const sig = sign(null, buildSigningInput(p, footer, 'revocations'), signer.privateKey)
  return assembleToken(p, footer, new Uint8Array(sig), 'revocations')
}

/** Still well-formed PASETO; one payload character changed, so the signature fails. */
export function tamper(token: string): string {
  const i = 'v4.public.'.length + 20
  return token.slice(0, i) + (token[i] === 'A' ? 'B' : 'A') + token.slice(i + 1)
}
