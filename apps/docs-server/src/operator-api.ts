/**
 * Operator API tab — the generated `docs/openapi/admin-api.openapi.json`
 * on the same Swagger reference shell as /unified-api (sidebar of tag
 * groups and operations, filter, theming — see swagger-reference.ts). The
 * plugin contains ZERO hand-written endpoint content: everything you see in
 * the Operator API tab falls out of admin-api's route schemas via the
 * snapshot pipeline.
 *
 * "Try it out" is on, but it is browsing-only in practice, for one
 * reason: CORS. The generated spec carries a `servers` block defaulting
 * to admin-api's own origin (`http://localhost:3001` — emitted by
 * `generate-admin-openapi.ts`), so Swagger UI does send requests toward
 * :3001, but the browser blocks them: admin-api builds its Fastify
 * instance without `corsOrigin`, so it sends no `Access-Control-*`
 * headers. (integration-server is the one service that opts in, via
 * `CORS_ORIGIN` — see the /unified-api tab.) Read the spec here;
 * drive admin-api from curl or the Postman collection.
 */
import type { FastifyPluginAsync } from 'fastify'
import { BRANDING_HEAD_LINKS } from './branding.js'
import { NAV_STYLES } from './header.js'
import { SEARCH_PALETTE_STYLES } from './search-palette.js'
import { renderSwaggerReference } from './swagger-reference.js'

export const OPERATOR_API_SPEC_URL = '/specs/admin-api.openapi.json'

const HEAD = `
  <link rel="stylesheet" href="/design/tokens.css">
  <link rel="stylesheet" href="/design/base.css">
  <link rel="stylesheet" href="/design/components.css">
  <link rel="icon" href="/design/logo/mark.svg" type="image/svg+xml" media="(prefers-color-scheme: light)">
  <link rel="icon" href="/design/logo/mark-dark.svg" type="image/svg+xml" media="(prefers-color-scheme: dark)">
  ${BRANDING_HEAD_LINKS}
  <link rel="stylesheet" href="/design/vendor/phosphor/regular/style.css">
  <script>
    (function () {
      try {
        var stored = localStorage.getItem('os-theme')
        var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
        var theme = stored || (prefersDark ? 'dark' : 'light')
        if (theme === 'dark') document.documentElement.setAttribute('data-theme', 'dark')
      } catch (e) {}
    })()
    function oiToggleTheme() {
      var next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'
      if (next === 'dark') document.documentElement.setAttribute('data-theme', 'dark')
      else document.documentElement.removeAttribute('data-theme')
      try { localStorage.setItem('os-theme', next) } catch (e) {}
    }
  </script>
  <style>${NAV_STYLES}</style>
  <style>${SEARCH_PALETTE_STYLES}</style>
`

export function operatorApiHtml(): string {
  return renderSwaggerReference({
    title: 'Operator API',
    head: HEAD,
    specJsonUrl: OPERATOR_API_SPEC_URL,
    anchorLinks: [
      { href: OPERATOR_API_SPEC_URL, label: 'admin-api.openapi.json', className: 'mono' },
    ],
    // admin-api's tags are resources (Users, Runtime settings, Audit…),
    // not verticals, so the rail says so and gets plain tiles.
    groupNoun: 'section',
    groupsEyebrow: 'Sections',
    // No `vertical` + `platform` parameters here, and no platform catalog
    // to read: the cascade would have nothing to wire.
    adapterCascade: false,
  })
}

/**
 * Fastify plugin that mounts the Operator API tab at `/operator-api`.
 * The matching static spec at `/specs/admin-api.openapi.json` is
 * served by the docs-server's existing `/specs/` mount — no extra
 * static wiring is required as long as the snapshot lives next to
 * the integration-server spec under `docs/openapi/`.
 */
export const operatorApiPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.get('/operator-api', async (_request, reply) => {
    reply.type('text/html').send(operatorApiHtml())
  })
}
