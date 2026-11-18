/**
 * A strict Content-Security-Policy for the pages that show stored customer
 * data (the data viewer) and charts over it (dashboards).
 *
 * The rest of the console runs without a CSP (see server.ts: inline handlers
 * in older views would break), so these pages opt in per route plugin. The
 * policy allows no inline script and no inline handler: everything these
 * pages and the shell run is an external same-origin file
 * (`public/js/shell.js`, `theme-init.js`, `json-view.js`, `dashboard.js`,
 * `/vendor/echarts.min.js`). Styles may be inline (the views use `style=""`
 * throughout, and the branding head injects a `<style>`).
 *
 * `font-src` adds `data:` for a font uploaded under Company info, and — only
 * when an external font stylesheet is configured instead — that stylesheet's
 * origin under `style-src` and any https font host under `font-src`.
 *
 * The embedded Superset page (`routes/superset.ts`) adds `frame-src` for the
 * Superset origin only; every other page frames nothing.
 */
import type { FastifyInstance, FastifyRequest } from 'fastify'

export const STRICT_CSP_BASE = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "frame-ancestors 'none'",
] as const

function externalFontOrigin(request: FastifyRequest): string | null {
  const c = request.companyInfo
  if (!c || c.fontDataUrl || !c.fontUrl) return null
  try {
    const u = new URL(c.fontUrl)
    return u.protocol === 'https:' ? u.origin : null
  } catch {
    return null
  }
}

/** The http(s) origin of `url`, or null — never anything a header could be split on. */
export function cspOrigin(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    const u = new URL(url)
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.origin : null
  } catch {
    return null
  }
}

export interface StrictCspExtras {
  /**
   * Origin a page may frame (`frame-src`), e.g. the embedded Superset
   * dashboards' host. Without it nothing is framed beyond `default-src`.
   */
  frameSrc?: string | null
}

export function strictCspFor(request: FastifyRequest, extras: StrictCspExtras = {}): string {
  const fontOrigin = externalFontOrigin(request)
  const directives: string[] = [...STRICT_CSP_BASE]
  if (fontOrigin) {
    directives[2] = `style-src 'self' 'unsafe-inline' ${fontOrigin}`
    directives.push("font-src 'self' data: https:")
  } else {
    directives.push("font-src 'self' data:")
  }
  const frame = cspOrigin(extras.frameSrc)
  if (frame) directives.push(`frame-src ${frame}`)
  return directives.join('; ')
}

/**
 * Apply the strict policy to every response of the plugin it is called in.
 * `frameSrc(request)` may name an origin to allow in `frame-src` for that
 * response (read after the handler ran, so a handler can decide it).
 */
export function useStrictCsp(
  fastify: FastifyInstance,
  opts: { frameSrc?: (request: FastifyRequest) => string | null | undefined } = {},
): void {
  fastify.addHook('onSend', async (request, reply, payload) => {
    reply.header(
      'Content-Security-Policy',
      strictCspFor(request, { frameSrc: opts.frameSrc?.(request) ?? null }),
    )
    return payload
  })
}
