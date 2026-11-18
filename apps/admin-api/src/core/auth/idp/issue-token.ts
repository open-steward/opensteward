/**
 * Token issuance — converges every SSO/LDAP path onto the SAME admin JWT the
 * rest of the system already understands ({ id, username, role }), then mints a
 * single-use handoff code so the admin UI can set its session cookie.
 */
import type { Role, IdentityStore } from '../../db/identity-store'

export interface TokenUserPayload {
  id: string
  username: string
  role: Role
}

/** Byte-for-byte the shape jwt-auth.ts TokenUser expects. */
export function buildTokenPayload(user: { id: string; username: string; role: Role }): TokenUserPayload {
  return { id: user.id, username: user.username, role: user.role }
}

export type JwtSigner = (payload: TokenUserPayload) => string

/** Sign the JWT and stash it behind a single-use handoff code. Returns the
 *  code the browser carries back to the UI. */
export async function issueHandoff(
  identityStore: IdentityStore,
  sign: JwtSigner,
  user: { id: string; username: string; role: Role },
): Promise<string> {
  const payload = buildTokenPayload(user)
  const token = sign(payload)
  return identityStore.createHandoff(token, payload)
}
