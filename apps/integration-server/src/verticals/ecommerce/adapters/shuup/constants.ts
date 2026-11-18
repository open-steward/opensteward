/**
 * Shuup REST API constants.
 *
 * Shuup is an open-source Python/Django ecommerce and marketplace platform.
 * It exposes a REST API via Django REST Framework (DRF) under the `/api/v1`
 * prefix on the self-hosted store URL.
 *
 * Auth is a static DRF token (or JWT) sent via the `Authorization` header.
 * No OAuth code-exchange flow exists.
 *
 * API docs: https://shuup.readthedocs.io/en/latest/api/
 */

/** Path prefix for the Shuup DRF REST API. */
export const API_PREFIX = '/api/v1'

/** Shuup resource path prefix (DRF router). */
export const SHUUP_PREFIX = '/api/v1/shuup'

export const DEFAULT_PAGE_SIZE = 25
export const MAX_PAGE_SIZE = 100
