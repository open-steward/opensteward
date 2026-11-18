/**
 * Shared logo scraping utility — fetches SVG logos from provider websites
 * by scraping HTML for og:image, favicon, and common logo patterns.
 */
import { writeFileSync, existsSync } from 'fs'
import type { PlatformLike } from './types'

async function fetchText(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) return ''
    return await res.text()
  } catch {
    return ''
  }
}

function fetchPage(url: string): Promise<string> {
  return fetchText(url)
}

function extractLogoUrl(html: string, baseUrl: string): string | null {
  // Try og:image
  const ogMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/)
  if (ogMatch?.[1]) return resolveUrl(ogMatch[1], baseUrl)

  // Try common SVG patterns
  const svgPatterns = [
    /["']([^"']*logo[^"']*\.svg)["']/i,
    /["']([^"']*brand[^"']*\.svg)["']/i,
    /<link[^>]*rel=["']icon["'][^>]*href=["']([^"']+\.svg)["']/i,
  ]
  for (const pattern of svgPatterns) {
    const match = html.match(pattern)
    if (match?.[1]) return resolveUrl(match[1], baseUrl)
  }
  return null
}

function resolveUrl(url: string, base: string): string {
  if (url.startsWith('http')) return url
  if (url.startsWith('//')) return `https:${url}`
  if (url.startsWith('/')) {
    const origin = new URL(base).origin
    return `${origin}${url}`
  }
  return `${base.replace(/\/$/, '')}/${url}`
}

async function fetchSvg(url: string): Promise<string | null> {
  const content = await fetchText(url)
  if (!content) return null
  if (content.includes('<svg') || content.includes('<?xml')) return content
  return null
}

export async function scrapeLogos(
  platforms: PlatformLike[],
  outputDir: string,
  options?: { force?: boolean },
): Promise<{ scraped: number; skipped: number; failed: number }> {
  let scraped = 0
  let skipped = 0
  let failed = 0

  for (const p of platforms) {
    const outPath = `${outputDir}/${p.slug}.svg`
    if (!options?.force && existsSync(outPath)) {
      skipped++
      continue
    }

    const html = await fetchPage(p.website)
    if (!html) {
      failed++
      continue
    }

    const logoUrl = extractLogoUrl(html, p.website)
    if (!logoUrl) {
      failed++
      continue
    }

    const svg = await fetchSvg(logoUrl)
    if (svg) {
      writeFileSync(outPath, svg)
      scraped++
    } else {
      failed++
    }
  }

  return { scraped, skipped, failed }
}
