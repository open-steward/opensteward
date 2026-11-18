/**
 * FP Sign REST API constants.
 *
 * FP Sign (FP Digital Business / Francotyp-Postalia) is a German qualified
 * trust-service e-signature platform. The REST API is versioned in the path
 * (`/api/v1_2`) and split across two environments — production
 * (app.fp-sign.com) and staging (app.staging.fp-sign.com).
 *
 * Auth is a Bearer token obtained from `POST /login`, paired with a `Tenant`
 * header carrying the account's tenant id. Both are collected via the Connect
 * Link credential form.
 *
 * Docs: https://www.fp-sign.com/en/de/signaturloesung/api-dokumentation-0
 * Reference client + Swagger: https://github.com/vneri/FPSignAPI
 */

/** Production REST base. */
export const API_BASE_URL = 'https://app.fp-sign.com/api/v1_2'

/** Staging / sandbox REST base. */
export const SANDBOX_BASE_URL = 'https://app.staging.fp-sign.com/api/v1_2'

/**
 * FP Sign list endpoints return every id in the collection, with no paging
 * parameter; detail endpoints take a comma-joined id list. The adapter pages
 * the id list locally and hydrates at most this many ids per detail request.
 */
export const MAX_PAGE_SIZE = 200
