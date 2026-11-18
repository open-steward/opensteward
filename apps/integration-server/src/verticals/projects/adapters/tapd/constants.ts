/**
 * TAPD REST API (v1).
 *
 * TAPD is Tencent's project management platform. Every request goes to
 * `https://api.tapd.cn`, authenticated with HTTP Basic Auth using an
 * application ID and application secret registered in the TAPD open platform.
 *
 * Canonical hierarchy:
 *   Workspace  ← company (top-level org, identified by company_id)
 *   Project    ← TAPD workspace (a project within the company)
 *   Task       ← TAPD story (user story / requirement within a project)
 *   Comment    ← TAPD comment
 *   Tag        ← TAPD label
 *   User       ← TAPD workspace member
 *
 * Auth:  HTTP Basic — Authorization: Basic base64(apiUser:apiPassword)
 * Docs:  https://open.tapd.cn/document/api-doc/
 */

/** Production API base URL. TAPD has no public sandbox. */
export const API_BASE_URL = 'https://api.tapd.cn'

/** Where users register applications and obtain an API user + password. */
export const TOKEN_HELP_URL = 'https://www.tapd.cn/help/view#1120003271001002318'

/**
 * Pagination: TAPD uses page-number + limit pagination.
 * `page` is 1-based (default: 1), `limit` is items-per-page (default: 30, max: 200).
 */
export const DEFAULT_PAGE_SIZE = 200

/** Number of retries on transient (429 / 5xx) failures. */
export const MAX_RETRIES = 4

/**
 * Largest `limit` a paged TAPD list accepts. GET /stories: "默认返回 30 条。
 * 可通过传 limit 参数设置，最大取 200。也可以传 page 参数翻页"
 * (https://open.tapd.cn/document/api-doc/API%E6%96%87%E6%A1%A3/api_reference/story/get_stories.html)
 */
export const MAX_PAGE_SIZE = 200
