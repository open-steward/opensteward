/**
 * 1CRM REST API constants.
 *
 * The API is self-hosted: every deployment has its own base URL of the form
 * https://<instance>.1crmcloud.com  (SaaS) or any custom domain.
 * The `ONECRM_BASE_URL` constant is used as the default demo/sandbox base;
 * real adapters supply the tenant URL at construction time.
 *
 * Docs: https://demo.1crmcloud.com/api.php
 */

/** Public demo / sandbox base URL (no trailing slash). */
export const ONECRM_DEFAULT_BASE_URL = 'https://demo.1crmcloud.com'

/**
 * API path prefix — all data endpoints are rooted here.
 * Full URL: `${baseUrl}${ONECRM_API_PATH}/data/Contact`
 */
export const ONECRM_API_PATH = '/api.php'

/** OAuth2 authorization endpoint path (appended to the tenant base URL). */
export const ONECRM_AUTH_PATH = '/api.php/auth/user/authorize'

/** OAuth2 token endpoint path (appended to the tenant base URL). */
export const ONECRM_TOKEN_PATH = '/api.php/auth/user/access_token'

/** Default pagination limit (1CRM default is 20, max 200). */
export const ONECRM_DEFAULT_LIMIT = 20

/** Documented maximum for /data/{model} `limit`: "Int [1:200] (20)". */
export const ONECRM_MAX_LIMIT = 200

/** Default OAuth2 scopes requested for CRM access. */
export const DEFAULT_ONECRM_SCOPES: readonly string[] = ['read', 'write']

/**
 * 1CRM module names used in REST endpoint paths.
 * These are singular English names as documented by the 1CRM API.
 */
export const ONECRM_MODULE = {
  CONTACT: 'Contact',
  ACCOUNT: 'Account',
  OPPORTUNITY: 'Opportunity',
  TASK: 'Task',
  NOTE: 'Note',
} as const
