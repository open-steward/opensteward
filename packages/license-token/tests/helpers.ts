import { generateKeyPairSync, sign, type KeyObject } from 'node:crypto'
import { LICENSE_ASSERTION, PASETO_HEADER } from '../src/constants'
import type { KeyMap } from '../src/keys'
import { v4PublicEncode, v4PublicPreAuth } from '../src/paseto'
import type { Footer, LicensePayload, RevocationPayload } from '../src/schema'
import { canonicalFooterBytes, canonicalPayloadBytes } from '../src/serialize'
import { assembleToken, buildSigningInput } from '../src/sign'

export const NOW = new Date('2026-10-09T12:00:00Z')

/** Handover §3 example, with the limit key renamed to tenants (D-B). */
export function validPayload(overrides: Partial<LicensePayload> = {}): LicensePayload {
  return {
    iss: 'opensteward.dev',
    aud: 'opensteward',
    sub: 'lic_8f3k2abc',
    org: 'Acme Försäkring AB',
    tier: 'free',
    features: ['mcp', 'vertical:accounting', 'vertical:crm', 'vertical:payments'],
    limits: { connections: 5, tenants: 1 },
    label: 'production',
    env: 'prod',
    iat: '2026-10-06T17:00:00Z',
    nbf: '2026-10-06T17:00:00Z',
    exp: '2027-10-06T17:00:00Z',
    ver: 1,
    ...overrides,
  }
}

export interface TestKey {
  kid: string
  privateKey: KeyObject
  publicKey: string
}
export function makeKey(kid = 'test1'): TestKey {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519')
  return { kid, privateKey, publicKey: publicKey.export({ format: 'jwk' }).x! }
}
export const keyMapOf = (...keys: TestKey[]): KeyMap =>
  Object.fromEntries(keys.map((k) => [k.kid, k.publicKey]))

/** What the license service does, with node:crypto standing in for KMS Sign (ED25519_SHA_512, RAW). */
export function mint(payload: LicensePayload, key: TestKey): string {
  const footer: Footer = { kid: key.kid }
  return assembleToken(
    payload,
    footer,
    sign(null, buildSigningInput(payload, footer), key.privateKey),
  )
}

const OVERHEAD = 8 + 4 * 8 + PASETO_HEADER.length + LICENSE_ASSERTION.length
const sizeOf = (p: LicensePayload, footer: Footer) =>
  OVERHEAD + canonicalFooterBytes(footer).length + canonicalPayloadBytes(p).length
/** A valid payload whose signing input is exactly `target` bytes under `footer`. */
export function sized(target: number, footer: Footer = { kid: 'test1' }): LicensePayload {
  let p = validPayload({ org: 'A', features: ['mcp'] })
  for (let i = 0; ; i++) {
    const next = { ...p, features: [...p.features, `pad${String(i).padStart(47, '0')}`] } // +53 bytes
    if (sizeOf(next, footer) > target - 1) break
    p = next
  }
  p = { ...p, org: 'A'.repeat(1 + target - sizeOf(p, footer)) } // 1..53 one-byte chars
  if (sizeOf(p, footer) !== target)
    throw new Error(`sized(${target}) produced ${sizeOf(p, footer)}`)
  return p
}

/** Signs arbitrary bytes as a correct signer would, for payloads the schema would refuse to build. */
export function signRawBytes(
  key: TestKey,
  m: Uint8Array,
  rawFooter = JSON.stringify({ kid: key.kid }),
  assertion = LICENSE_ASSERTION,
): string {
  const enc = new TextEncoder()
  const f = enc.encode(rawFooter)
  return v4PublicEncode(
    m,
    sign(null, v4PublicPreAuth(m, f, enc.encode(assertion)), key.privateKey),
    f,
  )
}
export const signRaw = (key: TestKey, rawPayload: string, rawFooter?: string, assertion?: string) =>
  signRawBytes(key, new TextEncoder().encode(rawPayload), rawFooter, assertion)

export function mintRevocations(list: RevocationPayload, key: TestKey): string {
  const footer: Footer = { kid: key.kid }
  const signature = sign(null, buildSigningInput(list, footer, 'revocations'), key.privateKey)
  return assembleToken(list, footer, signature, 'revocations')
}
