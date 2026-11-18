/**
 * Normalized platform metadata — bridges accounting's `auth_type`/`hq_country`
 * and logistics' `authType`/`category` into a single shape.
 */
export interface PlatformLike {
  slug: string
  name: string
  authType: string // 'oauth2' | 'oauth2_cc' | 'api_key' | 'basic' | 'session' | 'local'
  website: string
  category?: string
  hqCountry?: string
  primaryColor?: string
  docsUrl?: string
  pricingUrl?: string
  foundedYear?: number
  description?: string
}

export interface EnvExtras {
  [slug: string]: {
    base_url?: string
    notes?: string
  }
}

export interface PostmanConfig {
  openapiPath: string
  outputDir: string
  collectionName: string
  tagDisplayNames: Record<string, string>
  exampleBodies: Record<string, unknown>
  defaultPlatform: string
  environments: Array<{ name: string; baseUrl: string }>
  collectionDescription?: string
}
