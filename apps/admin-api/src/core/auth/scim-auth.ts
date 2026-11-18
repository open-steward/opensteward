/**
 * SCIM bearer-token authentication — distinct from the admin JWT. Validates the
 * `Authorization: Bearer scim_…` token against the scim_tokens table (hashed,
 * constant-time compare) and scopes the request to the owning provider.
 */
import type { FastifyRequest, FastifyReply } from 'fastify'
import type { IdentityStore } from '../db/identity-store'
import { tagGuard } from './route-access'

declare module 'fastify' {
  interface FastifyRequest {
    scimProviderId?: string
    scimTokenId?: string
  }
}

function scimError(reply: FastifyReply, status: number, detail: string) {
  return reply
    .status(status)
    .header('content-type', 'application/scim+json')
    .send({ schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'], status: String(status), detail })
}

export function makeScimAuth(identityStore: IdentityStore) {
  return tagGuard(async function scimAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const header = request.headers.authorization
    if (!header || !header.startsWith('Bearer ')) {
      await scimError(reply, 401, 'Missing bearer token')
      return
    }
    const token = header.slice('Bearer '.length).trim()
    const result = await identityStore.verifyScimToken(token)
    if (!result) {
      await scimError(reply, 401, 'Invalid or revoked SCIM token')
      return
    }
    request.scimProviderId = result.providerId
    request.scimTokenId = result.tokenId
  }, { kind: 'scim' })
}

export { scimError }
