/**
 * Control plane — vertical-agnostic routes the unified OpenSteward
 * service mounts at the root: auth, connections, health.
 *
 * Each vertical contributes its resource routes under `/v1/{vertical}/`,
 * but auth and connection management live here so they're written once.
 */

export { adminGuard } from './admin-guard'
export {
  createUnifiedAuthMiddleware,
  assertVerticalScopes,
  type UnifiedAuthOptions,
} from './auth-middleware'
export { createAdminOAuthRouter, type AdminOAuthRouterOptions } from './admin-oauth-router'
export {
  resolveDeveloperCredential,
  extractBearerToken as extractDeveloperBearerToken,
} from './credential-resolver'
export type {
  ResolvedPrincipal,
  DeveloperCredentialOptions,
  AuthToggleSource,
  AuthMethod,
} from './credential-resolver'
export { createUnifiedAuthRouter, type UnifiedAuthRouterOptions } from './auth-router'
export {
  createUnifiedConnectionsRouter,
  type UnifiedConnectionsRouterOptions,
} from './connections-router'
export { createUnifiedHealthRouter, type UnifiedHealthRouterOptions } from './health-router'
export {
  createVersionRouter,
  readGitSha,
  readBuildTime,
  readRelease,
  type VersionRouterOptions,
  type VersionPayload,
} from './version-router'
export {
  createUnifiedPlatformsRouter,
  type UnifiedPlatformsRouterOptions,
  type PlatformEntry,
} from './platforms-router'
export {
  createUnifiedAdminPlatformsRouter,
  type UnifiedAdminPlatformsRouterOptions,
} from './admin-platforms-router'
export {
  createUnifiedWebhooksRouter,
  type UnifiedWebhooksRouterOptions,
  type WebhookConfig,
} from './webhooks-router'
export { InboundEventStore } from './inbound-event-store'
export type { InboundEventInsert, InboundEventRow } from './inbound-event-store'
export { createWebhookConsumer } from './webhook-consumer'
export type {
  WebhookConsumer,
  WebhookConsumerDeps,
  InboundConsumeInput,
  RefreshResourceFn,
} from './webhook-consumer'
export { createInboundEventsRouter } from './inbound-events-router'
export type { InboundEventsRouterOptions } from './inbound-events-router'
export { resolvePublicBaseUrl, publicUrl } from './public-base-url'
export type { PublicBaseUrlInputs } from './public-base-url'
export { wellKnownAcmePlugin } from './well-known'
export { HostInfoFetcher } from './host-info'
export type { HostBranding, HostInfoFetcherOptions } from './host-info'
export { TenantDomainFetcher, DEFAULT_TENANT } from './tenant-domains'
export type { TenantDomainEntry, TenantDomainFetcherOptions } from './tenant-domains'
export { brandingHead, brandingCss } from './branding-head'
export { createConnectRouter } from './connect-router'
export type { ConnectRouterOptions } from './connect-router'
export { createConnectAdminRouter } from './connect-admin-router'
export type { ConnectAdminRouterOptions } from './connect-admin-router'
export { createCustomersRouter } from './customers-router'
export type { CustomersRouterOptions } from './customers-router'
export { createConnectionsDevRouter } from './connections-dev-router'
export type { ConnectionsDevRouterOptions } from './connections-dev-router'
export { createApiKeysAdminRouter } from './api-keys-admin-router'
export type { ApiKeysAdminRouterOptions } from './api-keys-admin-router'
export { createWebhookSubsAdminRouter } from './webhook-subs-admin-router'
export { createWebhookSubsDevRouter, MAX_WEBHOOK_SUBS_PER_TENANT } from './webhook-subs-dev-router'
export { sendSyntheticTest } from './webhook-test-send'
export type { WebhookSubsAdminRouterOptions } from './webhook-subs-admin-router'
export type { WebhookSubsDevRouterOptions } from './webhook-subs-dev-router'
export type { TestSendDeps, TestSendResult } from './webhook-test-send'
export { emitTenantEvent, deliverOne, signBody } from './event-emitter'
export type {
  TenantEvent,
  EventEnvelope,
  EmitOptions,
  PlatformEventBody,
  DeliverOneOptions,
} from './event-emitter'
export {
  renderPayload,
  summarize,
  isWebhookFormat,
  WEBHOOK_FORMATS,
  DEFAULT_WEBHOOK_FORMAT,
  TEST_EVENT_TYPE,
} from './webhook-formats'
export type { WebhookFormat, RenderContext } from './webhook-formats'
export { validateHeaders, MAX_HEADERS, MAX_HEADER_BYTES } from './webhook-headers'
export type { ValidateHeadersResult } from './webhook-headers'
export { WebhookRetryWorker } from './webhook-retry-worker'
export type { WebhookRetryWorkerOptions } from './webhook-retry-worker'
export {
  requireTenantKey,
  extractBearerToken,
  resolveApiKey,
  assertScope,
  refuseIfMcpClientLacksScope,
  refuseIfMcpDisabled,
  refuseIfMcpWrite,
} from './api-key-middleware'
export type {
  ApiKeyMiddlewareOptions,
  McpEnabledSource,
  RateLimitConfigSource,
} from './api-key-middleware'
export type { McpRefusal } from './mcp-guards'
export type { ConnectionWriteGuard, ConnectionWriteRefusal } from './vertical-scopes'
export { requireEndUserToken, DEFAULT_END_USER_RATE_LIMIT } from './end-user-token-middleware'
export type { EndUserTokenMiddlewareOptions } from './end-user-token-middleware'
export { createUnifiedEndUserAuthMiddleware } from './end-user-auth-middleware'
export { createSandboxAuthMiddleware } from './sandbox-auth-middleware'
export { createSandboxMetaRouter } from './sandbox-meta-router'
export { createSandboxSyncRouter, SANDBOX_SYNC_JOBS_TYPE } from './sandbox-sync-router'
export type { SandboxMetaRouterOptions } from './sandbox-meta-router'
export type { SandboxSyncRouterOptions } from './sandbox-sync-router'
export { createSandboxKeysRouter } from './sandbox-keys-router'
export { createSandboxControlPlaneRouter } from './sandbox-control-plane-router'
export type { SandboxKeysRouterOptions } from './sandbox-keys-router'
export type { SandboxControlPlaneRouterOptions } from './sandbox-control-plane-router'
export { createSandboxAuthRouter } from './sandbox-auth-router'
export type { SandboxAuthRouterOptions } from './sandbox-auth-router'
export {
  encodeSandboxLinkToken,
  decodeSandboxLinkToken,
  sandboxCustomerIds,
} from './sandbox-link-token'
export type { SandboxLinkToken } from './sandbox-link-token'
export type { SandboxAuthOptions, SandboxAdapterFactory } from './sandbox-auth-middleware'
export type { UnifiedEndUserAuthOptions } from './end-user-auth-middleware'
export { createEndUserRouter } from './end-user-router'
export type { EndUserRouterOptions } from './end-user-router'
export { attachAdapterErrorHandler, redactUpstreamBody } from './adapter-error-handler'
export { createEndUserTokensAdminRouter } from './end-user-tokens-admin-router'
export type { EndUserTokensAdminRouterOptions } from './end-user-tokens-admin-router'
export {
  consume as consumeRateLimit,
  consumeInMemory,
  inMemoryLimiter,
  redisLimiter,
  setRateLimiter,
  getRateLimiter,
  resetRateLimitBuckets,
  DEFAULT_API_KEY_RATE_LIMIT,
} from './rate-limit'
export type { RateLimitConfig, RateLimitResult, RateLimiter, RedisLikeClient } from './rate-limit'
export {
  validateRedirectUri,
  isValidRedirectUri,
  InvalidRedirectUriError,
} from './redirect-uri-validator'
export type { ValidateRedirectUriOptions } from './redirect-uri-validator'
