/**
 * `/.well-known/acme-challenge/*` no-op handler.
 *
 * OpenSteward delegates TLS / ACME entirely to the operator's reverse
 * proxy (Caddy, Traefik, nginx + certbot, …). If a request for an ACME
 * challenge ever reaches the app, it means the proxy didn't intercept it
 * and the deployment is misconfigured. We respond with a fast plain 404
 * — no logging, no body — so misrouted ACME traffic doesn't pollute the
 * app log and no one mistakenly thinks the app is participating in cert
 * issuance.
 */
import type { FastifyPluginAsync } from 'fastify'

export const wellKnownAcmePlugin: FastifyPluginAsync = async (fastify) => {
  fastify.get('/.well-known/acme-challenge/*', async (_request, reply) => {
    reply.status(404).send()
  })
}
