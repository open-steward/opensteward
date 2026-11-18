import type { BaseAdapter } from './base'
import type { AdapterSettings, AdapterSettingsStore } from './settings-store'

/**
 * Generic adapter registry — works with any adapter type extending BaseAdapter.
 *
 * Two modes of operation:
 *
 * 1. **Static**: construct empty, then call `register(adapter)` directly.
 *    Used by tests and single-adapter apps.
 *
 * 2. **Mutable** (recommended): pass a `vertical`, an `AdapterSettingsStore`,
 *    and a factory map in the constructor. Use `enable(slug, config?)` and
 *    `disable(slug)` to toggle adapters at runtime — settings are persisted
 *    to the store keyed by `(vertical, slug)`, and the factory is invoked
 *    with the stored config.
 *
 * Usage (mutable):
 *   const registry = new AdapterRegistry<LogisticsAdapter>({
 *     vertical: 'logistics',
 *     factories: ADAPTER_FACTORIES,
 *     settingsStore,
 *   })
 *   registry.hydrate()                          // load enabled adapters from store
 *   registry.enable('fortnox', { clientId, clientSecret })
 *   registry.disable('fortnox')
 */
export type AdapterFactory<T extends BaseAdapter = BaseAdapter> = (
  config?: Record<string, unknown>,
) => T

export interface AdapterRegistryOptions<T extends BaseAdapter = BaseAdapter> {
  /** Vertical that owns this registry — required when settingsStore is set. */
  vertical?: string
  /** Static map of slug → factory used by enable() to instantiate adapters. */
  factories?: Record<string, AdapterFactory<T>>
  /** Persistent settings store. When provided, enable/disable persist + restore. */
  settingsStore?: AdapterSettingsStore
}

export class AdapterRegistry<T extends BaseAdapter = BaseAdapter> {
  private adapters = new Map<string, T>()
  private factories: Record<string, AdapterFactory<T>>
  private settingsStore?: AdapterSettingsStore
  private vertical?: string

  constructor(opts: AdapterRegistryOptions<T> = {}) {
    this.factories = opts.factories ?? {}
    this.settingsStore = opts.settingsStore
    this.vertical = opts.vertical
    if (this.settingsStore && !this.vertical) {
      throw new Error('AdapterRegistry: `vertical` is required when `settingsStore` is provided')
    }
  }

  // ── Static API ─────────────────────────────────────────────────────────────

  register(adapter: T): void {
    this.adapters.set(adapter.platform, adapter)
  }

  unregister(platform: string): boolean {
    return this.adapters.delete(platform)
  }

  get(platform: string): T | undefined {
    return this.adapters.get(platform)
  }

  list(): string[] {
    return Array.from(this.adapters.keys())
  }

  has(platform: string): boolean {
    return this.adapters.has(platform)
  }

  count(): number {
    return this.adapters.size
  }

  // ── Mutable API (factory-driven) ───────────────────────────────────────────

  /** All slugs known to the factory map (whether enabled or not). */
  knownSlugs(): string[] {
    return Object.keys(this.factories)
  }

  /** Re-instantiate every enabled adapter from the settings store. */
  async hydrate(): Promise<void> {
    if (!this.settingsStore || !this.vertical) return
    for (const settings of await this.settingsStore.listEnabled(this.vertical)) {
      const factory = this.factories[settings.slug]
      if (!factory) {
        // Settings exist for an unknown slug — skip silently (could log).
        continue
      }
      this.adapters.set(settings.slug, factory(settings.config))
    }
  }

  /**
   * Enable an adapter: persist `enabled=true` (and optional config) to the
   * settings store, then instantiate via the factory and register.
   */
  async enable(slug: string, config?: Record<string, unknown>): Promise<T> {
    const factory = this.factories[slug]
    if (!factory) {
      throw new Error(`AdapterRegistry: unknown adapter slug "${slug}"`)
    }
    let resolvedConfig = config
    if (this.settingsStore && this.vertical) {
      const settings = await this.settingsStore.upsert(this.vertical, slug, {
        enabled: true,
        config,
      })
      resolvedConfig = settings.config
    }
    const adapter = factory(resolvedConfig)
    this.adapters.set(slug, adapter)
    return adapter
  }

  /**
   * Disable an adapter: persist `enabled=false` and remove from the registry.
   * The settings row (and stored config) is preserved so re-enabling restores
   * credentials without re-entry.
   */
  async disable(slug: string): Promise<boolean> {
    if (this.settingsStore && this.vertical) {
      const existing = await this.settingsStore.get(this.vertical, slug)
      if (existing) {
        await this.settingsStore.upsert(this.vertical, slug, { enabled: false })
      }
    }
    return this.adapters.delete(slug)
  }

  /**
   * Update an adapter's stored config without changing its enabled state.
   * Merges with the existing config — keys not present in `config` are kept.
   * Pass `null` for a key to clear it. If the adapter is currently enabled it
   * is re-instantiated with the merged config so changes take effect
   * immediately. The merge semantic exists so a UI can submit only the fields
   * it wants to change (e.g. update `clientId` without re-entering
   * `clientSecret`); a full-replace caller still works since every key it
   * provides overwrites the corresponding stored value.
   */
  async setConfig(
    slug: string,
    config: Record<string, unknown>,
  ): Promise<AdapterSettings | undefined> {
    if (!this.settingsStore || !this.vertical) return undefined
    const existing = await this.settingsStore.get(this.vertical, slug)
    const merged: Record<string, unknown> = { ...(existing?.config ?? {}) }
    for (const [k, v] of Object.entries(config)) {
      if (v === null) delete merged[k]
      else merged[k] = v
    }
    const settings = await this.settingsStore.upsert(this.vertical, slug, { config: merged })
    if (settings.enabled && this.factories[slug]) {
      const factory = this.factories[slug]
      this.adapters.set(slug, factory(settings.config))
    }
    return settings
  }

  /**
   * Returns one row per known slug (from the factory map), merged with
   * persisted state. Used by admin UI to show "available" + "enabled" together.
   */
  async listAll(): Promise<Array<{ slug: string; enabled: boolean; hasConfig: boolean }>> {
    const out: Array<{ slug: string; enabled: boolean; hasConfig: boolean }> = []
    for (const slug of this.knownSlugs()) {
      const settings =
        this.settingsStore && this.vertical
          ? await this.settingsStore.get(this.vertical, slug)
          : undefined
      out.push({
        slug,
        enabled: this.adapters.has(slug),
        hasConfig: settings ? Object.keys(settings.config).length > 0 : false,
      })
    }
    return out.sort((a, b) => a.slug.localeCompare(b.slug))
  }
}
