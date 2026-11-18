/**
 * UnifiedAdapterRegistry — composes per-vertical AdapterRegistry instances
 * into a single `(vertical, slug)` lookup surface for the unified service.
 *
 * Why a separate class rather than a Map<string, AdapterRegistry>: two
 * verticals can ship adapters with the same slug (e.g. `bexio` exists in both
 * accounting and crm). The unified service needs a stable, vertical-aware
 * key — `${vertical}:${slug}` — so connections from different verticals to
 * the same upstream platform never get cross-wired.
 */

import type { BaseAdapter } from './base'
import type { AdapterRegistry } from './registry'

/** Subset of AdapterRegistry the unified facade actually needs to forward. */
export interface VerticalRegistry {
  get(slug: string): BaseAdapter | undefined
  has(slug: string): boolean
  list(): string[]
  count(): number
  knownSlugs(): string[]
  enable(slug: string, config?: Record<string, unknown>): BaseAdapter
  disable(slug: string): boolean
  setConfig(slug: string, config: Record<string, unknown>): unknown
}

export class UnifiedAdapterRegistry {
  private byVertical = new Map<string, VerticalRegistry>()

  /** Register a per-vertical registry under `vertical`. */
  register(vertical: string, registry: VerticalRegistry): void {
    if (this.byVertical.has(vertical)) {
      throw new Error(`UnifiedAdapterRegistry: vertical "${vertical}" already registered`)
    }
    this.byVertical.set(vertical, registry)
  }

  /** Get an enabled adapter by (vertical, slug). */
  get(vertical: string, slug: string): BaseAdapter | undefined {
    return this.byVertical.get(vertical)?.get(slug)
  }

  /** True if `(vertical, slug)` is enabled. */
  has(vertical: string, slug: string): boolean {
    return this.byVertical.get(vertical)?.has(slug) ?? false
  }

  /** All registered verticals. */
  verticals(): string[] {
    return Array.from(this.byVertical.keys())
  }

  /** Per-vertical enabled-slug list. */
  listByVertical(vertical: string): string[] {
    return this.byVertical.get(vertical)?.list() ?? []
  }

  /** Flat `${vertical}:${slug}` list across every vertical. */
  listAll(): string[] {
    const out: string[] = []
    for (const [vertical, reg] of this.byVertical) {
      for (const slug of reg.list()) out.push(`${vertical}:${slug}`)
    }
    return out
  }

  /** Total enabled adapters across all verticals. */
  count(): number {
    let n = 0
    for (const reg of this.byVertical.values()) n += reg.count()
    return n
  }

  /** Per-vertical known-slug map (factory-known, not enabled-state). */
  knownSlugsByVertical(): Record<string, string[]> {
    const out: Record<string, string[]> = {}
    for (const [vertical, reg] of this.byVertical) out[vertical] = reg.knownSlugs()
    return out
  }

  /** Enable an adapter live in the matching vertical's registry. */
  enable(vertical: string, slug: string, config?: Record<string, unknown>): BaseAdapter {
    const reg = this.byVertical.get(vertical)
    if (!reg) throw new Error(`UnifiedAdapterRegistry: unknown vertical "${vertical}"`)
    return reg.enable(slug, config)
  }

  /** Disable an adapter live in the matching vertical's registry. */
  disable(vertical: string, slug: string): boolean {
    return this.byVertical.get(vertical)?.disable(slug) ?? false
  }

  /** Replace stored config; re-instantiates the adapter if it's currently enabled. */
  setConfig(vertical: string, slug: string, config: Record<string, unknown>): void {
    this.byVertical.get(vertical)?.setConfig(slug, config)
  }
}

/**
 * Type guard so callers can pass a typed AdapterRegistry without losing the
 * vertical's adapter type at the call site.
 */
export function asVerticalRegistry<T extends BaseAdapter>(
  registry: AdapterRegistry<T>,
): VerticalRegistry {
  return registry as unknown as VerticalRegistry
}
