import { readFile } from 'node:fs/promises'
import path from 'node:path'

const cache = new Map<string, string | null>()

/**
 * Returns the base64-encoded SVG for the given provider slug, or null if the
 * logo file does not exist yet. Results are cached in memory after the first
 * read so subsequent calls incur no I/O.
 *
 * The slug must be validated against the providers map by the caller before
 * this function is invoked — this prevents path traversal.
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

/** Clears the in-memory cache — intended for use in tests only. */
export function clearLogoCache(): void {
  cache.clear()
}
