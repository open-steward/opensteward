/**
 * Typed identifiers for every admin-tunable setting. Match the seed
 * inventory in `apps/admin-api/src/core/db/runtime-settings-store.ts`.
 *
 * Centralising the keys here keeps callers from typoing — every read
 * site references one of these constants.
 */

export const SETTING = {
  // Rate limits
  RATE_LIMIT_API_KEY_PER_MIN: 'rate_limit.api_key.per_minute',
  RATE_LIMIT_API_KEY_WINDOW_MS: 'rate_limit.api_key.window_ms',
  RATE_LIMIT_MCP_TENANT_PER_MIN: 'rate_limit.mcp_tenant.per_minute',
  RATE_LIMIT_MCP_END_USER_PER_MIN: 'rate_limit.mcp_end_user.per_minute',
  RATE_LIMIT_CONNECT_LINK_PER_MIN: 'rate_limit.connect_link.per_minute',
  // Features
  FEATURES_MCP_ENABLED: 'features.mcp_enabled',
  FEATURES_END_USER_MODE_ENABLED: 'features.end_user_mode_enabled',
  FEATURES_TEST_MODE_ENABLED: 'features.test_mode_enabled',
  // Connect links
  CONNECT_LINK_DEFAULT_EXPIRY_HOURS: 'connect_link.default_expiry_hours',
  CONNECT_LINK_ONE_TIME_DEFAULT: 'connect_link.one_time_default',
  // Auth / SSO
  AUTH_LOCAL_LOGIN_ENABLED: 'auth.local_login_enabled',
  AUTH_BREAK_GLASS_USER_ID: 'auth.break_glass_user_id',
  AUTH_DEV_API_KEYS_ENABLED: 'auth.dev_api_keys_enabled',
  AUTH_DEV_OAUTH_ENABLED: 'auth.dev_oauth_enabled',
  AUTH_SANDBOX_SELF_SERVE_ENABLED: 'auth.sandbox_self_serve_enabled',
  // Data store — upstream payload retention, per vertical
  DATA_STORE_RAW_PAYLOAD_PAYMENTS: 'data_store.raw_payload.payments',
  DATA_STORE_RAW_PAYLOAD_ACCOUNTING: 'data_store.raw_payload.accounting',
  // Data store — sync schedules
  DATA_STORE_SYNC_DEFAULT_INTERVAL_MINUTES: 'data_store.sync.default_interval_minutes',
  DATA_STORE_SYNC_SCHEDULER_ENABLED: 'data_store.sync.scheduler_enabled',
  // Data access — the admin data viewer, exports and dashboards
  DATA_ACCESS_MASK_FINANCIAL: 'data_access.mask_financial',
  // Webhooks — retention for PII-bearing payload stores
  WEBHOOKS_DELIVERY_RETENTION_DAYS: 'webhooks.delivery_retention_days',
  WEBHOOKS_INBOUND_EVENT_RETENTION_DAYS: 'webhooks.inbound_event_retention_days',
  // Audit log
  AUDIT_LOG_RETENTION_DAYS: 'audit_log.retention_days',
  // Platform logos
  LOGOS_SOURCE: 'logos.source',
  LOGOS_BRANDFETCH_CLIENT_ID: 'logos.brandfetch_client_id',
  LOGOS_FETCH_DELAY_MS: 'logos.fetch_delay_ms',
  LOGOS_FETCH_REFERER: 'logos.fetch_referer',
  LOGOS_JOB_RETENTION_DAYS: 'logos.job_retention_days',
} as const

export type SettingKey = (typeof SETTING)[keyof typeof SETTING]
