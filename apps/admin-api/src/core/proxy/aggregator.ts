/**
 * Thin facade over UnifiedClient — `allConnections()` / `allPlatforms()` /
 * `healthCheck()` are each a single request against the unified backend,
 * which knows about every vertical.
 */
import type { UnifiedClient, VerticalConnection, VerticalPlatform } from './client'

export type TaggedConnection = VerticalConnection
export type TaggedPlatform = VerticalPlatform

export interface VerticalStatus {
  name: string
  status: 'up' | 'down'
  adapterCount: number
  error?: string
}

export class Aggregator {
  constructor(
    private client: UnifiedClient,
    private verticalNames: string[],
  ) {}

  async healthCheck(): Promise<VerticalStatus[]> {
    try {
      const h = await this.client.getHealth()
      const verticals = h.verticals ?? this.verticalNames
      // Prefer the per-vertical breakdown. Without it every vertical showed
      // the deployment-wide total — one enabled accounting adapter read as
      // "1 adapter" against all nine. The fallback keeps an older backend
      // that sends only `adapters` working as before.
      const byVertical = h.adaptersByVertical
      return verticals.map((name) => ({
        name,
        status: 'up' as const,
        adapterCount: byVertical ? (byVertical[name] ?? 0) : (h.adapters ?? 0),
      }))
    } catch (err) {
      return this.verticalNames.map((name) => ({
        name,
        status: 'down' as const,
        adapterCount: 0,
        error: String(err),
      }))
    }
  }

  async allConnections(): Promise<TaggedConnection[]> {
    try {
      return await this.client.listConnections()
    } catch {
      return []
    }
  }

  async allPlatforms(): Promise<TaggedPlatform[]> {
    try {
      return await this.client.listCatalog()
    } catch {
      return []
    }
  }

  getClient(): UnifiedClient {
    return this.client
  }

  /** True if this admin-api is configured to surface `vertical`. */
  knownVertical(vertical: string): boolean {
    return this.verticalNames.includes(vertical)
  }
}
