import { readFile } from 'node:fs/promises'
import path from 'node:path'

const cache = new Map<string, string | null>()

/**
 * Returns the base64-encoded SVG for the given adapter slug, or null if the
 * logo file does not exist yet. Reads from `public/logos/<slug>.svg` (the same
 * directory the other verticals consume) and caches results in memory.
 *
 * Caller must validate the slug against the PLATFORMS metadata before invoking
 * this function — otherwise it's a path-traversal foot-gun.
 */
export async function getLogo(slug: string): Promise<string | null> {
  if (cache.has(slug)) return cache.get(slug)!
  const filePath = path.join(process.cwd(), 'public', 'logos', `${slug}.svg`)
  try {
    const buf = await readFile(filePath)
    const b64 = buf.toString('base64')
    cache.set(slug, b64)
    return b64
  } catch {
    cache.set(slug, null)
    return null
  }
}

export function clearLogoCache(): void {
  cache.clear()
}
