import { verifyRevocationList, type KeyMap } from '@opensteward/license-token'
import { isDevKid } from './keyring'

export interface RevocationState {
  status: 'ok' | 'missing' | 'invalid'
  revoked: ReadonlySet<string>
  /** Why the list is invalid: a verifier reason, or DEV_KID_SIGNER. Never token text. */
  reason?: string
  issuedAt?: string
}

/**
 * Verifies the shipped revocation list. Never throws: a missing or invalid list
 * is a warning, never a blocked start (handover §6). Only a production kid may
 * sign it (P9): the dev1 private key is public, so a dev-signed list proves
 * nothing.
 */
export function loadRevocations(token: string | null, keyMap: KeyMap): RevocationState {
  const none: ReadonlySet<string> = new Set()
  if (!token?.trim()) return { status: 'missing', revoked: none }
  const verdict = verifyRevocationList(token.trim(), keyMap)
  if (!verdict.ok) return { status: 'invalid', revoked: none, reason: verdict.reason }
  if (isDevKid(verdict.kid)) return { status: 'invalid', revoked: none, reason: 'DEV_KID_SIGNER' }
  return { status: 'ok', revoked: new Set(verdict.payload.revoked), issuedAt: verdict.payload.iat }
}
