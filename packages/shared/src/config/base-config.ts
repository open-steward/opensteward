/**
 * Base configuration types shared across all integration verticals.
 *
 * Each app extends BaseConfig with domain-specific fields:
 *   - Accounting adds: adapters, dataStore, sync, defaultPlatform
 *   - Logistics adds: adapters
 */

export interface RateLimitEntry {
  max: number
  timeWindow: number
}

export interface WebhookAdapterConfig {
  secret?: string
}

export interface AdapterConfig {
  enabled: boolean
  redirectUri?: string
  scopes?: string[]
  [key: string]: unknown
}

export interface BaseConfig {
  server: {
    port: number
    host: string
  }
  store: {
    path: string
  }
  rateLimit?: {
    global?: RateLimitEntry
    adapters?: Record<string, RateLimitEntry | undefined>
  }
  webhooks?: {
    callbackUrl?: string
    adapters?: Record<string, WebhookAdapterConfig | undefined>
  }
  adapters?: Record<string, AdapterConfig | undefined>
}
