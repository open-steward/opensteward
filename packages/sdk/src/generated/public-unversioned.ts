/**
 * @opensteward/sdk — generated module. DO NOT EDIT.
 *
 * Source: docs/openapi/openapi.json
 * Generator: packages/sdk/scripts/sdk-codegen.ts (openapi-typescript)
 *
 * Regenerate via `pnpm sdk:generate` (also runs as part of
 * `pnpm docs:all`). CI fails if this file drifts from the source spec.
 */

/**
 * Path keys that are already absolute and must NOT be prefixed with the
 * API version. Everything else in `paths` had its `/v1/` stripped by the
 * spec generator and needs it back.
 */
export const UNVERSIONED_PATHS: ReadonlySet<string> = new Set([
  '/admin/api-keys',
  '/admin/api-keys/{id}',
  '/admin/connect-sessions',
  '/admin/connect-sessions/{id}',
  '/admin/connections',
  '/admin/connections/{id}',
  '/admin/connections/{id}/cache-clear',
  '/admin/connections/{id}/sync-schedule',
  '/admin/end-users',
  '/admin/end-users/{id}',
  '/admin/platforms',
  '/admin/platforms/{vertical}/{slug}/config',
  '/admin/platforms/{vertical}/{slug}/disable',
  '/admin/platforms/{vertical}/{slug}/enable',
  '/admin/sync-jobs',
  '/admin/sync-jobs/{id}',
  '/admin/sync-jobs/{id}/cancel',
  '/admin/webhook-subscriptions',
  '/admin/webhook-subscriptions/{id}',
  '/admin/webhook-subscriptions/{id}/deliveries',
  '/admin/webhook-subscriptions/{id}/deliveries/{deliveryId}/replay',
  '/admin/webhook-subscriptions/{id}/test',
  '/auth/{vertical}/{platform}/callback',
  '/auth/{vertical}/{platform}/connect',
  '/health',
  '/test/oidc/.well-known/openid-configuration',
  '/test/oidc/jwks',
  '/test/oidc/token',
  '/test/v1/auth/{vertical}/{platform}/callback',
  '/test/v1/auth/{vertical}/{platform}/connect',
  '/test/v1/connections',
  '/test/v1/keys',
  '/test/v1/reset',
  '/webhooks/{vertical}/{platform}',
])
