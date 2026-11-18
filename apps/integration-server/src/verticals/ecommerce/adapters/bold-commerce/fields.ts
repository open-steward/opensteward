/**
 * Field guards shared by the Bold transforms. Each one keeps a documented
 * value only when it fits the canonical type, and otherwise leaves the field
 * out (the raw record stays in `metadata`) — never a substitute value.
 */
import type { Address } from '../../schema/shared'

/** Canonical `ImageSchema.url`: an absolute http(s) URL or an absolute path. */
export function assetUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || value === '') return undefined
  if (value.startsWith('/')) return value
  try {
    const u = new URL(value)
    return u.protocol === 'http:' || u.protocol === 'https:' ? value : undefined
  } catch {
    return undefined
  }
}

/** Canonical `Slug`: lowercase letters, digits and hyphens. */
export function slug(value: unknown): string | undefined {
  return typeof value === 'string' && /^[a-z0-9-]+$/.test(value) ? value : undefined
}

/** Canonical `Address.country`: ISO 3166-1 alpha-2. */
export function alpha2(value: unknown): string | undefined {
  return typeof value === 'string' && /^[A-Z]{2}$/.test(value) ? value : undefined
}

/** Bold tags are "A string with comma separated values". */
export function splitTags(value: unknown): string[] | undefined {
  if (typeof value !== 'string') return undefined
  const tags = value
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
  return tags.length > 0 ? tags : undefined
}

/** Drop keys whose value is undefined, so an absent field is absent. */
export function compactAddress(address: Address): Address | undefined {
  const out = Object.fromEntries(
    Object.entries(address).filter(([, v]) => v !== undefined && v !== null && v !== ''),
  ) as Address
  return Object.keys(out).length > 0 ? out : undefined
}
