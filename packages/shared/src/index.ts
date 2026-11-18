/**
 * @opensteward/shared — public API
 *
 * Named exports are grouped by domain to avoid collisions between verticals
 * that define different shapes for the same concept (e.g. Address).
 */

// ── Auth ─────────────────────────────────────────────────────────────────────
export { CredentialStore, DuplicateLabelError } from './auth/store'
export type {
  Credentials,
  ConnectionRow,
  CredentialStoreOptions,
  RefreshStatus,
  ConnectionCreateGuard,
  ConnectionCreateIntent,
} from './auth/store'
export {
  withRefreshLock,
  isRefreshing,
  setRefreshLock,
  redisRefreshLock,
} from './auth/refresh-lock'
export type { RefreshLockBackend, RedisRefreshLockOptions } from './auth/refresh-lock'
export {
  isInvalidGrant,
  isInvalidClient,
  classifyRefreshError,
  refreshStatusForError,
} from './auth/refresh-error'
export type { RefreshErrorKind } from './auth/refresh-error'
export { safeStrEqual } from './util/safe-equal'
export { resolveLogoConfig } from './config/logo-source'
export {
  attachAdapterErrorHandler,
  redactUpstreamBody,
} from './control-plane/adapter-error-handler'
export {
  withPageSink,
  reportUpstreamPage,
  readUpstreamPage,
  declaredPageMax,
  effectivePageSize,
} from './adapter/page-meta'
export type { UpstreamPageMeta, PageMaxBearing } from './adapter/page-meta'
export {
  pageByCursor,
  cursorPagerKey,
  connectionScope,
  _resetCursorPager,
  _cursorPagerSize,
} from './adapter/cursor-pager'
export type { CursorPage, PagedResult } from './adapter/cursor-pager'
export { pageByRows, _resetRowPager, _rowPagerSize } from './adapter/row-pager'
export type { RowPagerOptions } from './adapter/row-pager'
export { registerLogoProxy } from './control-plane/logo-proxy'
export type { LogoProxyOptions } from './control-plane/logo-proxy'
export type {
  LogoSource,
  LogoConfig,
  LogoConfigOverrides,
  ResolveLogoConfigOpts,
} from './config/logo-source'
export { refreshWithRotationGuard } from './auth/refresh-runner'
export { TokenRefresher } from './auth/token-refresher'
export type { RefreshStore, RefreshOutcome, RefreshResult } from './auth/refresh-runner'
export { basicAuth, parseTokenResponse } from './auth/oauth-helpers'
export { encrypt, decrypt, deriveKey, DEFAULT_SALT } from './auth/crypto'
export {
  INTEGRATION_SERVER_BLOBS,
  DATA_STORE_BLOBS,
  ADMIN_API_BLOBS,
  type EncryptedBlob,
} from './sqlite/encrypted-blobs'

// ── SQLite migrations ───────────────────────────────────────────────────────
export { applyMigrations } from './sqlite/migrate'
export type { Migration, AppliedMigrationsReport, ApplyMigrationsOptions } from './sqlite/migrate'

// ── DB backend (runtime-selectable SQLite/Postgres) ─────────────────────────
export { openDb, resolveDbConfig } from './db'
export type { Dialect, DbHandle, DualMigration, OpenDbOptions, ResolvedDbConfig } from './db'

// ── HTTP ─────────────────────────────────────────────────────────────────────
export { withRetry } from './http/with-retry'
export { EndUserStore, DuplicateEmailError } from './auth/end-users'
export type { EndUserRow, EndUserSummaryRow, EndUserStoreOptions } from './auth/end-users'
export { ConnectSessionStore } from './auth/connect-sessions'
export type { ConnectSessionRow, ConnectSessionStoreOptions } from './auth/connect-sessions'
export {
  ApiKeyStore,
  apiKeyPrefixOf,
  hasScope,
  IncompatibleMcpScopesError,
  assertMcpScopesCompatible,
} from './auth/api-keys'
export type {
  ApiKeyMode,
  ApiKeyRow,
  ApiKeyStoreOptions,
  MintResult,
  RotateResult,
} from './auth/api-keys'
export { readClaimValues, readSingleClaim, parseScopeClaim, MAX_CLAIM_VALUES } from './auth/claims'
export * from './auth/permissions'
export {
  OAuthClientStore,
  InvalidIssuerError,
  validateIssuerInput,
  AUTHORITY_MODES,
  ALLOWED_ALGORITHMS,
  DEFAULT_ALGORITHMS,
  DEFAULT_MAX_TOKEN_LIFETIME_S,
} from './auth/oauth-clients'
export type {
  AuthorityMode,
  OAuthIssuerRow,
  OAuthClientRow,
  OAuthScopeRuleRow,
  IssuerInput,
} from './auth/oauth-clients'
export {
  verifyOAuthToken,
  resolveAuthority,
  discoverIssuer,
  looksLikeJwt,
  mapTokenScopes,
  resetJwksCache,
  findPreset,
  DiscoveryError,
  ISSUER_PRESETS,
} from './auth/oidc-verifier'
export type {
  OAuthPrincipal,
  VerifyResult,
  VerifyFailureReason,
  IssuerPreset,
} from './auth/oidc-verifier'
export { EndUserTokenStore } from './auth/end-user-tokens'
export type {
  EndUserTokenRow,
  EndUserMintResult,
  EndUserTokenStoreOptions,
} from './auth/end-user-tokens'
export { RuntimeSettingsClient, nullRuntimeSettingsClient } from './runtime-settings/client'
export type { RuntimeSettingsClientOptions } from './runtime-settings/client'
export { SETTING } from './runtime-settings/keys'
export {
  stripRawPayload,
  stripRawPayloads,
  RAW_PAYLOAD_VERTICALS,
} from './data-store/strip-raw-payload'
export type { RawPayloadPolicy } from './data-store/resource-store'
export {
  ResourcePageError,
  isValidDataPath,
  PAGE_MAX_LIMIT,
  PAGE_COUNT_CAP,
  CHANGES_DEFAULT_LAG_MS,
  METRIC_FILTER_OPS,
  FIELD_COMPARE_OPS,
  FETCH_VALUES_CAP,
} from './data-store/resource-store'
export type {
  PageSort,
  PageDir,
  PageFilterOp,
  PageFilter,
  PageOptions,
  StoredResource,
  ResourcePage,
  ChangesSinceOptions,
  ChangeBatch,
  Tombstone,
  ConnectionResourceCount,
  AggregateOptions,
  AggregateRow,
  MetricFilterOp,
  MetricStoreFilter,
  FieldCompareOp,
  MetricStoreCompare,
  AggregateDimension,
  MetricQueryBase,
  AggregateV2Options,
  AggregateV2Row,
  FetchValuesOptions,
  FetchValuesResult,
  LookupLabelsOptions,
  DistinctValuesSelect,
} from './data-store/resource-store'
export {
  CHART_TYPES,
  METRIC_UNITS,
  GRANULARITIES,
  GRANULARITY_PARAMS,
  METRIC_SECTIONS,
  METRIC_KINDS,
} from './dashboards/charts'
export type {
  ChartType,
  MetricUnit,
  Granularity,
  GranularityParam,
  MetricSection,
  MetricKind,
} from './dashboards/charts'
export * from './data-classification'
export { createAdminOAuthRouter } from './control-plane/admin-oauth-router'
export type { AdminOAuthRouterOptions } from './control-plane/admin-oauth-router'
export {
  resolveDeveloperCredential,
  extractBearerToken as extractDeveloperBearerToken,
} from './control-plane/credential-resolver'
export type {
  ResolvedPrincipal,
  DeveloperCredentialOptions,
  AuthToggleSource,
  AuthMethod,
} from './control-plane/credential-resolver'
export type { SettingKey } from './runtime-settings/keys'
export {
  DEFAULT_OPENAPI_SERVERS,
  SERVER_URL_TEMPLATE,
  UNVERSIONED_SERVER_URL_TEMPLATE,
  TEST_SERVER_URL_TEMPLATE,
  buildServersBlock,
  isVersionedPath,
  mergeServerVariables,
  validateServerVariables,
} from './openapi-servers'
export type { BuildServersOptions } from './openapi-servers'
export type {
  OpenApiServer,
  OpenApiServerVariable,
  OpenApiServersConfig,
  ResolvedServerVariables,
  ServerVariableName,
} from './openapi-servers'
export { WebhookSubscriptionStore, MAX_WEBHOOK_LABEL_LENGTH } from './auth/webhook-subscriptions'
export type {
  WebhookSubscriptionRow,
  WebhookSubscriptionWithSecret,
  WebhookSubscriptionStoreOptions,
} from './auth/webhook-subscriptions'
export {
  WebhookDeliveryStore,
  RETRY_DELAYS as WEBHOOK_RETRY_DELAYS,
  MAX_ATTEMPTS as WEBHOOK_MAX_ATTEMPTS,
} from './auth/webhook-deliveries'
export type {
  WebhookDeliveryRow,
  WebhookDeliveryWithBody,
  WebhookDeliveryStoreOptions,
  DeliveryStatus as WebhookDeliveryStatus,
} from './auth/webhook-deliveries'
export { assertSecret } from './auth/secrets'
export {
  safeFetch,
  assertPublicHost,
  isPrivateIp,
  setDnsResolver,
  SsrfBlockedError,
} from './net/safe-fetch'
export { validatePassword } from './auth/passwords'
export { extractTenantId } from './auth/tenant'
export { resolveConnection } from './auth/connection-resolver'
export type { ConnectionResolution } from './auth/connection-resolver'
export { generateState, storePendingState, consumePendingState, isTokenExpired } from './auth/oauth'
export type { PendingState } from './auth/oauth'
export { collectOAuthInputs } from './auth/oauth-inputs'
export type { CollectedOAuthInputs } from './auth/oauth-inputs'

// ── Schemas: connection (vertical-agnostic) ───────────────────────────────────
export {
  ConnectionSchema,
  ConnectionStatusSchema,
  UpdateConnectionBodySchema,
  computeStatus,
} from './schemas/connection'
export type { Connection, ConnectionStatus, UpdateConnectionBody } from './schemas/connection'

// ── Schemas: company info (operator branding) ─────────────────────────────────
export { CompanyInfoSchema } from './schemas/company-info'
export type { CompanyInfo, CompanyInfoRecord } from './schemas/company-info'

// ── Schemas: end-users (external customers receiving connect links) ──────────
export {
  EndUserSchema,
  EndUserPiiSchema,
  EndUserAddressSchema,
  CreateEndUserBodySchema,
  UpdateEndUserBodySchema,
  maskPii,
  withoutPii,
} from './schemas/end-user'
export type {
  EndUser,
  EndUserPii,
  EndUserAddress,
  CreateEndUserBody,
  UpdateEndUserBody,
} from './schemas/end-user'

// ── Schemas: connect sessions (Connect Links) ────────────────────────────────
export {
  ConnectSessionSchema,
  ConnectSessionStatusSchema,
  ConnectAllowedPlatformSchema,
  CreateConnectSessionBodySchema,
  deriveStatus as deriveConnectSessionStatus,
} from './schemas/connect-session'
export type {
  ConnectSession,
  ConnectSessionStatus,
  ConnectAllowedPlatform,
  CreateConnectSessionBody,
} from './schemas/connect-session'

// ── Schemas: ISO standard primitives (currency, country, datetime, etc.) ─────
export {
  Iso4217Currency,
  Iso3166Alpha2,
  ISO_3166_1_ALPHA2_CODES,
  isIso3166Alpha2,
  IsoDatetime,
  IsoDate,
  HexColor,
  Slug,
  HHMMTime,
  toIsoDatetime,
  toSlug,
} from './schemas/iso'
export type { Iso4217CurrencyT, Iso3166Alpha2T } from './schemas/iso'
export { majorToMinor, minorToMajor, minorUnitExponent } from './schemas/money'

// ── Zod ergonomics ──────────────────────────────────────────────────────────
export { nullish, withUnknown } from './schemas/zod-helpers'
export {
  Name,
  Description,
  Note,
  ExternalId,
  Email,
  Amount,
  requireAmount,
  NAME_MAX,
  DESCRIPTION_MAX,
  NOTE_MAX,
  EXTERNAL_ID_MAX,
  EMAIL_MAX,
  CalendarDate,
  DateOrCalendarDate,
} from './schemas/limits'
export { AddressSchema } from './schemas/address'
export type { Address } from './schemas/address'

// ── Schemas: accounting vertical ─────────────────────────────────────────────
export * as accounting from './schemas/accounting'

// ── Schemas: logistics vertical ──────────────────────────────────────────────
export * as logistics from './schemas/logistics'

// ── Schemas: payments vertical ───────────────────────────────────────────────
export * as payments from './schemas/payments'

// ── Webhook utils ─────────────────────────────────────────────────────────────
export {
  verifyHmacSha256,
  verifyStripeStyleSignature,
  verifyGithubStyleSignature,
  stripPrefix,
} from './webhook'
export type {
  WebhookHandler,
  WebhookVerificationCandidate,
  WebhookContextVerification,
} from './webhook'

// ── Circuit breaker ───────────────────────────────────────────────────────────
export { CircuitBreaker, isCircuitBreakerError } from './circuit-breaker'
export type { CircuitBreakerError } from './circuit-breaker'

// ── Adapter base ─────────────────────────────────────────────────────────────
export { AdapterRegistry } from './adapter/registry'
export type { BaseAdapter, QueryParams, CredentialField, AdapterCapabilities } from './adapter/base'
export { simpleApiKey, oauth2ClientCredentials, customForm } from './adapter/credential-templates'
export type {
  CredentialFormHelper,
  SimpleApiKeyOptions,
  Oauth2ClientCredentialsOptions,
  CustomFormOptions,
} from './adapter/credential-templates'
// ── Odoo: one client + Connect Link form for every Odoo adapter ─────────────
export {
  OdooClient,
  OdooError,
  odooDatetime,
  readOdooConnection,
  ODOO_API_VERSIONS,
  ODOO_PAGE_ORDER,
  _resetOdooUidCache,
  ODOO_CREDENTIAL_FORM,
  ODOO_CREDENTIAL_FIELDS,
  vetOdooUrl,
} from './adapter/odoo'
export type {
  OdooApiVersion,
  OdooConnection,
  OdooDomain,
  OdooPage,
  OdooSearchReadOptions,
} from './adapter/odoo'
export type { AdapterFactory, AdapterRegistryOptions } from './adapter/registry'
export { AdapterSettingsStore } from './adapter/settings-store'
export type { AdapterSettings, AdapterSettingsStoreOptions } from './adapter/settings-store'
export { UnifiedAdapterRegistry, asVerticalRegistry } from './adapter/unified-registry'
export type { VerticalRegistry } from './adapter/unified-registry'

// ── Control plane (unified service) ──────────────────────────────────────────
export {
  adminGuard,
  createUnifiedAuthMiddleware,
  createUnifiedAuthRouter,
  createUnifiedConnectionsRouter,
  createUnifiedHealthRouter,
  createVersionRouter,
  readGitSha,
  readBuildTime,
  readRelease,
  createUnifiedPlatformsRouter,
  createUnifiedAdminPlatformsRouter,
  createUnifiedWebhooksRouter,
  resolvePublicBaseUrl,
  publicUrl,
  wellKnownAcmePlugin,
  HostInfoFetcher,
  TenantDomainFetcher,
  DEFAULT_TENANT,
  brandingHead,
  brandingCss,
  createConnectRouter,
  createConnectAdminRouter,
  createCustomersRouter,
  createConnectionsDevRouter,
  createApiKeysAdminRouter,
  createWebhookSubsAdminRouter,
  createWebhookSubsDevRouter,
  MAX_WEBHOOK_SUBS_PER_TENANT,
  InboundEventStore,
  createWebhookConsumer,
  createInboundEventsRouter,
  emitTenantEvent,
  deliverOne,
  renderPayload,
  summarize,
  TEST_EVENT_TYPE,
  signBody,
  isWebhookFormat,
  WEBHOOK_FORMATS,
  DEFAULT_WEBHOOK_FORMAT,
  validateHeaders,
  MAX_HEADERS,
  MAX_HEADER_BYTES,
  WebhookRetryWorker,
  requireTenantKey,
  extractBearerToken,
  resolveApiKey,
  assertScope,
  refuseIfMcpClientLacksScope,
  refuseIfMcpDisabled,
  refuseIfMcpWrite,
  consumeRateLimit,
  consumeInMemory,
  inMemoryLimiter,
  redisLimiter,
  setRateLimiter,
  getRateLimiter,
  resetRateLimitBuckets,
  DEFAULT_API_KEY_RATE_LIMIT,
  requireEndUserToken,
  DEFAULT_END_USER_RATE_LIMIT,
  createUnifiedEndUserAuthMiddleware,
  createSandboxAuthMiddleware,
  createSandboxMetaRouter,
  createSandboxSyncRouter,
  createSandboxKeysRouter,
  createSandboxControlPlaneRouter,
  createSandboxAuthRouter,
  encodeSandboxLinkToken,
  decodeSandboxLinkToken,
  sandboxCustomerIds,
  SANDBOX_SYNC_JOBS_TYPE,
  assertVerticalScopes,
  createEndUserRouter,
  createEndUserTokensAdminRouter,
} from './control-plane'
export type {
  PublicBaseUrlInputs,
  HostBranding,
  HostInfoFetcherOptions,
  TenantDomainEntry,
  TenantDomainFetcherOptions,
  ConnectRouterOptions,
  ConnectAdminRouterOptions,
  CustomersRouterOptions,
  ConnectionsDevRouterOptions,
  ApiKeysAdminRouterOptions,
  WebhookSubsAdminRouterOptions,
  WebhookSubsDevRouterOptions,
  ApiKeyMiddlewareOptions,
  RateLimitConfig,
  RateLimitConfigSource,
  McpEnabledSource,
  McpRefusal,
  ConnectionWriteGuard,
  ConnectionWriteRefusal,
  RateLimitResult,
  RateLimiter,
  RedisLikeClient,
  TenantEvent,
  EventEnvelope,
  EmitOptions,
  PlatformEventBody,
  DeliverOneOptions,
  WebhookFormat,
  RenderContext,
  ValidateHeadersResult,
  InboundEventInsert,
  InboundEventRow,
  WebhookConsumer,
  WebhookConsumerDeps,
  InboundConsumeInput,
  RefreshResourceFn,
  InboundEventsRouterOptions,
  WebhookRetryWorkerOptions,
} from './control-plane'
export type {
  UnifiedAuthOptions,
  UnifiedAuthRouterOptions,
  UnifiedConnectionsRouterOptions,
  UnifiedHealthRouterOptions,
  VersionRouterOptions,
  VersionPayload,
  UnifiedPlatformsRouterOptions,
  UnifiedAdminPlatformsRouterOptions,
  UnifiedWebhooksRouterOptions,
  WebhookConfig,
  PlatformEntry,
} from './control-plane'

// ── Server bootstrap ─────────────────────────────────────────────────────────
export { createBaseServer, buildLoggerConfig, LOG_REDACT_PATHS } from './server/create-server'
export type { ServerConfig } from './server/create-server'
export { registerIdempotency } from './server/idempotency'
export type { IdempotencyStore } from './server/idempotency'

// ── Config ───────────────────────────────────────────────────────────────────
export { loadConfig } from './config'
export type { BaseConfig, RateLimitEntry, WebhookAdapterConfig, AdapterConfig } from './config'

// ── Reference data (ISO standards, shared constants) ─────────────────────────
export * as reference from './reference'
export { unsupportedIndex, unsupportedRefusal } from './reference/platform-status'
export type { UnsupportedPlatform } from './reference/platform-status'
export {
  VERIFICATION_TIERS,
  VERIFICATION_LABELS,
  VERIFICATION_RANK,
  isVerificationTier,
  meetsVerification,
  verificationIndex,
  verificationTally,
  verificationReadmeSentence,
  VERIFICATION_README_SENTENCE,
} from './reference/platform-verification'
export type { VerificationTier } from './reference/platform-verification'

// Sandbox (test mode) — synthetic records built from the canonical schemas.
export { buildFixture, buildFixtures, reviveDates } from './sandbox/fixtures'
export type { FixtureOptions } from './sandbox/fixtures'
export {
  SandboxStore,
  SandboxQuotaError,
  SandboxNotFoundError,
  DEFAULT_SANDBOX_QUOTA,
} from './sandbox/sandbox-store'
export type { SandboxRow, SandboxStoreOptions } from './sandbox/sandbox-store'
export { sandboxConnectionId, sandboxConnectionIds, isSandboxConnectionId } from './sandbox/ids'
export { createSandboxOidcRouter } from './control-plane/sandbox-oidc-router'
export type { SandboxOidcRouterOptions } from './control-plane/sandbox-oidc-router'
export { resolveSandboxCredential } from './control-plane/sandbox-credential'
export type { SandboxOauthOptions, SandboxPrincipal } from './control-plane/sandbox-credential'
export {
  createMockIssuerKeys,
  mintMockToken,
  discoveryDocument,
  jwksDocument,
  SANDBOX_ISSUER_PRESET,
  SANDBOX_ISSUER_PATH,
  MOCK_MODE_CLAIM,
} from './auth/mock-oidc-issuer'
export type { MockIssuerKeys, MintInput, MintedToken } from './auth/mock-oidc-issuer'
export {
  createMockOidcLogin,
  DEFAULT_PERSONAS,
  readNodeRequest,
  writeNodeResponse,
} from './auth/mock-oidc-login'
export type {
  MockOidcLogin,
  MockOidcLoginOptions,
  MockPersona,
  MockHttpRequest,
  MockHttpResponse,
} from './auth/mock-oidc-login'

// ── Query-param helpers (X-Admin-Secret routers, and admin-api's own) ───────
// `one()` collapses a repeated query key, last-wins. Exported because
// admin-api's `routes/_query.ts` held a character-for-character copy: that app
// already depends on this package, and the only thing keeping the duplicate
// alive was this line's absence.
export { one } from './util/query-params'

// ── Data store (resource cache + sync worker) ────────────────────────────────
export {
  ResourceStore,
  SyncStore,
  SyncWorker,
  ResourceProgressSchema,
  SyncJobSchema,
  SyncJobOriginSchema,
  CreateSyncJobBodySchema,
  sendCallback,
  cachedList,
  cachedGet,
  writeThrough,
  cachedDelete,
  isLive,
  stripCacheParams,
  createSyncRouter,
  attachDataStoreContext,
  createAdminCacheRouter,
  buildSyncOpenapiPaths,
  buildSyncOpenapiSchemas,
  createDataStoreMetricsRouter,
  createAdminSyncRouter,
  SYNC_MODES,
  SYNC_INTERVAL_MIN_MINUTES,
  SYNC_INTERVAL_MAX_MINUTES,
  DEFAULT_SYNC_INTERVAL_MINUTES,
  FIRST_RETRY_DELAY_MS,
  SyncScheduleSchema,
  EMPTY_SYNC_HISTORY,
  parseSyncMode,
  clampIntervalMinutes,
  retryDelayMs,
  describeConnectionSync,
  createSyncStateResolver,
} from './data-store'
export type {
  ResourceProgress,
  SyncJob,
  SyncJobOrigin,
  CreateSyncJobBody,
  ListableResource,
  SyncWorkerConfig,
  SyncWorkerLogger,
  SyncWorkerOptions,
  TokenRefresherLike,
  DataStoreMode,
  DataStoreEventEmitter,
  CreateSyncRouterOptions,
  AttachDataStoreContextOptions,
  CreateAdminCacheRouterOptions,
  SyncOpenapiOptions,
  CreateDataStoreMetricsRouterOptions,
  CreateAdminSyncRouterOptions,
  SyncMode,
  SyncSchedule,
  SyncHistory,
  SyncPausedReason,
  SyncScheduleInput,
  ConnectionSyncState,
  SyncStateResolver,
} from './data-store'
export {
  parseListQuery,
  callerLimit,
  parseUpdatedAfter,
  listPage,
  deriveHasMore,
  collectionIsComplete,
  DEFAULT_PAGE_LIMIT,
  MAX_PAGE_LIMIT,
  pageOffset,
  pageLocally,
  type ListMeta,
  type ListEnvelope,
  type ListPageLogger,
  singleResponse as sharedSingleResponse,
  type SingleMeta,
  type SingleEnvelope,
  adapterSupportsSearch,
  assertSearchSupported,
} from './router/list-envelope'
