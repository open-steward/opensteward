/**
 * Taiga REST API constants.
 *
 * Cloud base URL: https://api.taiga.io/api/v1
 * Self-hosted instances use their own base URL, configurable via TaigaAdapterConfig.baseUrl.
 *
 * Auth: token-based; tokens obtained by POST /auth with username+password.
 * Application tokens (self-hosted only) use Authorization: Application <token>.
 * For cloud API key usage, the user's auth_token is stored as accessToken.
 *
 * Docs: https://docs.taiga.io/api.html
 */

export const API_BASE_URL = 'https://api.taiga.io/api/v1'
export const DEFAULT_PAGE_SIZE = 100
/**
 * Largest `page_size` Taiga honours: taiga-back's REST settings set
 * `"MAX_PAGINATE_BY": 1000` and read the size through
 * `strict_positive_int(..., cutoff=self.max_paginate_by)`.
 * https://github.com/taigaio/taiga-back/blob/main/settings/common.py
 */
export const MAX_PAGE_SIZE = 1000
