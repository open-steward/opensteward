/**
 * Operator branding for the docs/developer portal.
 *
 * The portal's page headers are module-level constants, so rather than thread
 * the operator's branding through every template we serve it as two dynamic
 * routes that the static `<head>` fragments link to:
 *
 *   GET /branding.css      → colour + font token overrides (text/css)
 *   GET /branding/favicon  → the operator's uploaded favicon, or 404
 *
 * Branding is fetched from admin-api's public endpoint via the shared
 * `HostInfoFetcher` (60 s cache, fail-open). With `ADMIN_API_URL` unset the
 * fetcher returns empty defaults and both routes degrade gracefully (empty
 * stylesheet, 404 favicon → the design-system defaults show through).
 */
import type { FastifyInstance } from 'fastify'
import { HostInfoFetcher, brandingCss } from '@opensteward/shared'
import { setNavBrand } from './header.js'

/** Link tags injected into every portal page's <head> (after the design-system
 *  CSS + default favicons, so operator overrides win when present). */
export const BRANDING_HEAD_LINKS = `
  <link rel="stylesheet" href="/branding.css">
  <link rel="icon" href="/branding/favicon" sizes="any">
`

const FAVICON_DATA_URL = /^data:(image\/[a-z+.-]+);base64,([A-Za-z0-9+/=]+)$/

export function registerBrandingRoutes(fastify: FastifyInstance): void {
  const fetcher = new HostInfoFetcher()

  // Refresh the nav brand (name + logo) before HTML pages render. Branding is
  // deployment-global and the fetch is cached 60s, so this is a cheap cache
  // hit on the hot path. Skipped for asset/spec routes that never call
  // renderHeader(). Fail-open: errors leave the last-known (or default) brand.
  fastify.addHook('onRequest', async (request) => {
    const url = request.url.split('?')[0]
    if (
      url.startsWith('/design/') ||
      url.startsWith('/specs/') ||
      url.startsWith('/branding') ||
      // Logo bytes are assets, not pages. One catalog render pulls 100+ of
      // them, and setNavBrand is a global mutation none of them need.
      url.startsWith('/data/') ||
      url === '/health'
    ) {
      return
    }
    const host = await fetcher.get()
    setNavBrand({
      name: host.name,
      logoDataUrl: host.logoDataUrl,
      hideAttribution: host.hideAttribution,
    })
  })

  fastify.get('/branding.css', async (_request, reply) => {
    const host = await fetcher.get()
    reply.type('text/css').header('cache-control', 'public, max-age=60').send(brandingCss(host))
  })

  fastify.get('/branding/favicon', async (_request, reply) => {
    const host = await fetcher.get()
    const m = host.faviconDataUrl ? FAVICON_DATA_URL.exec(host.faviconDataUrl) : null
    if (!m) {
      reply.code(404).send()
      return
    }
    const [, mime, b64] = m
    reply.type(mime).header('cache-control', 'public, max-age=60').send(Buffer.from(b64, 'base64'))
  })
}
