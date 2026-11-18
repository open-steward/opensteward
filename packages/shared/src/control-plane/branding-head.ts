/**
 * Shared operator-branding fragments for every operator-facing surface.
 *
 *   brandingHead(host) → an HTML `<head>` fragment (favicon <link>, font
 *                        loading, and a `:root` token-override <style>).
 *                        Used where we inject straight into a rendered page:
 *                        the Connect Link pages and the admin UI layout.
 *
 *   brandingCss(host)  → the same colour/font overrides as raw CSS text (no
 *                        `<style>` wrapper). Used by the docs/developer portal,
 *                        which serves a dynamic `/branding.css` stylesheet
 *                        linked from its static page templates (the portal's
 *                        headers are module-level constants, so a linked
 *                        stylesheet brands every page without threading the
 *                        host through each template). The favicon is served
 *                        separately there as a dynamic route.
 *
 * Given the host's public branding (the same `HostBranding` that
 * `HostInfoFetcher` returns), these override the design-system `--accent` /
 * `--accent-hover` / `--font-sans` tokens with the operator's colours and
 * font, and load the font (an uploaded file via @font-face, or an external
 * stylesheet such as Google Fonts).
 *
 * Every value is re-validated and escaped here (defence-in-depth): the public
 * branding endpoint is unauthenticated, so we never trust the stored strings
 * to be injection-safe just because they passed write-time validation. Any
 * field that fails its shape check is silently dropped and the default
 * design-system styling shows through.
 */
import type { HostBranding } from './host-info'

const HEX = /^#[0-9a-f]{6}$/i
const FONT_FAMILY = /^[\w ,'"-]{1,120}$/
const FAVICON_DATA_URL = /^data:image\/[a-z+.-]+;base64,[A-Za-z0-9+/=]+$/
const FONT_DATA_URL =
  /^data:(font\/[a-z0-9.+-]+|application\/(font-[a-z0-9.+-]+|x-font-[a-z0-9.+-]+|octet-stream|vnd\.ms-fontobject));base64,[A-Za-z0-9+/=]+$/

const FALLBACK_SANS = `system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`

function escapeAttr(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  )
}

function isHttpsUrl(v: string): boolean {
  try {
    return new URL(v).protocol === 'https:'
  } catch {
    return false
  }
}

/** Map a font data URL's mimetype to a CSS `format()` hint, or '' if unknown. */
function fontFormat(dataUrl: string): string {
  const mime = dataUrl.slice(5, dataUrl.indexOf(';'))
  if (mime === 'font/woff2') return 'woff2'
  if (mime === 'font/woff' || mime === 'application/font-woff') return 'woff'
  if (mime === 'font/ttf') return 'truetype'
  if (mime === 'font/otf') return 'opentype'
  if (mime === 'application/vnd.ms-fontobject') return 'embedded-opentype'
  return ''
}

const familyOk = (host: HostBranding): boolean =>
  !!host.fontFamily && FONT_FAMILY.test(host.fontFamily)

/** `@font-face { … }` for an uploaded font file, or '' when there isn't one. */
function fontFaceCss(host: HostBranding): string {
  if (!familyOk(host) || !host.fontDataUrl || !FONT_DATA_URL.test(host.fontDataUrl)) return ''
  const fmt = fontFormat(host.fontDataUrl)
  const src = `url("${host.fontDataUrl}")${fmt ? ` format("${fmt}")` : ''}`
  return `@font-face { font-family: "${escapeAttr(host.fontFamily!)}"; src: ${src}; font-display: swap; }`
}

/** The body of a `:root { … }` rule (no braces), or '' when nothing to set. */
function rootVars(host: HostBranding): string {
  const vars: string[] = []
  if (host.primaryColor && HEX.test(host.primaryColor)) {
    vars.push(`--accent: ${host.primaryColor};`)
    const hover =
      host.secondaryColor && HEX.test(host.secondaryColor) ? host.secondaryColor : host.primaryColor
    vars.push(`--accent-hover: ${hover};`)
  } else if (host.secondaryColor && HEX.test(host.secondaryColor)) {
    vars.push(`--accent-hover: ${host.secondaryColor};`)
  }
  if (familyOk(host)) {
    vars.push(`--font-sans: "${escapeAttr(host.fontFamily!)}", ${FALLBACK_SANS};`)
  }
  return vars.join(' ')
}

/** True when the host has an external font stylesheet but no uploaded file. */
function usesExternalFont(host: HostBranding): boolean {
  const hasUpload = !!host.fontDataUrl && FONT_DATA_URL.test(host.fontDataUrl)
  return !hasUpload && !!host.fontUrl && isHttpsUrl(host.fontUrl)
}

/** HTML `<head>` fragment — favicon, font loading, and token overrides. */
export function brandingHead(host: HostBranding): string {
  const parts: string[] = []

  // Favicon — override the default design-system mark.
  if (host.faviconDataUrl && FAVICON_DATA_URL.test(host.faviconDataUrl)) {
    const type = host.faviconDataUrl.slice(5, host.faviconDataUrl.indexOf(';'))
    parts.push(
      `<link rel="icon" href="${escapeAttr(host.faviconDataUrl)}" type="${escapeAttr(type)}">`,
    )
  }

  // Font loading — uploaded file wins over external stylesheet URL.
  const face = fontFaceCss(host)
  if (face) {
    parts.push(`<style>${face}</style>`)
  } else if (usesExternalFont(host)) {
    parts.push(`<link rel="stylesheet" href="${escapeAttr(host.fontUrl!)}">`)
  }

  const vars = rootVars(host)
  if (vars) parts.push(`<style>:root { ${vars} }</style>`)

  return parts.join('\n')
}

/**
 * Raw CSS text (no `<style>` wrapper) with the operator's colour/font
 * overrides — suitable for serving as a standalone `/branding.css`. The
 * favicon is NOT included (a stylesheet can't set it); serve it as a separate
 * route. An external font stylesheet is pulled in via `@import`, which must
 * precede every other rule.
 */
export function brandingCss(host: HostBranding): string {
  const parts: string[] = []
  if (usesExternalFont(host)) parts.push(`@import url("${host.fontUrl!.replace(/"/g, '%22')}");`)
  const face = fontFaceCss(host)
  if (face) parts.push(face)
  const vars = rootVars(host)
  if (vars) parts.push(`:root { ${vars} }`)
  return parts.join('\n')
}
