// Tiny ERP API v3 constants
// OAuth2 endpoints from Keycloak realm (confirmed from TinyERPv3-SDK + community implementations)
export const TINY_AUTH_URL =
  'https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/auth'
export const TINY_TOKEN_URL =
  'https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/token'

// REST API base (v3)
// 'https://erp.tiny.com.br/api/v3' (the old value here) returns 403 on every
// route, with or without a Bearer token — confirmed by live probe 2026-09-13.
// The inventory/tiny-erp adapter had the identical defect.
export const TINY_API_BASE = 'https://api.tiny.com.br/public-api/v3'

// Tiny ERP does not expose a public sandbox environment.
// Rate limits vary by subscription plan:
//   Basic/Growth:      60 req/min,  30 writes/min
//   Essential/Evolve: 120 req/min,  60 writes/min
//   Large/Potentialize: 240 req/min, 100 writes/min
export const RATE_LIMIT_RPM = 60
export const MAX_PAGE_SIZE = 100
export const DEFAULT_PAGE_SIZE = 100

// Default OAuth2 scopes
// 'offline_access' is required for Tiny's Keycloak realm to issue a refresh_token.
// Without it, refreshCredentials() will always fail on long-lived connections.
export const DEFAULT_SCOPES = ['openid', 'offline_access']
