// Bman API is tenant-hosted at https://[domain].bman.it:3555/bmanapi.asmx
// The placeholder below is used when a tenant-specific domain is not configured.
// API key authentication via 'chiave' parameter from Utilità > Impostazioni > Integrazione
export const BMAN_API_BASE = 'https://cloud.bman.it'

// Rate limit: 5 req/sec (Enterprise only)
export const DEFAULT_PAGE_SIZE = 50
export const MAX_PAGE_SIZE = 100
