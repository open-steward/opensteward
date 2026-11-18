/**
 * LibreSign REST API constants.
 *
 * LibreSign is a self-hosted Nextcloud app, so there is no single vendor
 * host — every customer runs their own Nextcloud instance. The base URL is
 * supplied at connect time (the `serverUrl` credential field) and stored on
 * `credentials.extra.serverUrl`. Resource paths nest under the Nextcloud OCS
 * gateway: `${serverUrl}/ocs/v2.php/apps/libresign/api/${API_VERSION}`.
 *
 * Auth is an app password (treated as the API key): HTTP Basic of
 * `username:appPassword`. OCS endpoints additionally require the
 * `OCS-APIRequest: true` header and respond with JSON only when asked.
 *
 * Docs: https://libresign.github.io/Getting-started
 *       https://docs.libresign.coop/developer_manual/
 */

/** LibreSign OCS API version segment. */
export const API_VERSION = 'v1'

/** Nextcloud OCS gateway prefix the LibreSign app is mounted under. */
export const OCS_PREFIX = '/ocs/v2.php/apps/libresign/api'

/**
 * Sent as `length` when the caller gives no limit. `file-list` documents no
 * maximum for `length`; the server's own default is the admin-configurable
 * `length_of_page`, 100 unless changed (lib/Service/File/FileListService.php).
 */
export const DEFAULT_PAGE_SIZE = 100

/**
 * LibreSign file status integers (lib/Helper/ValidateHelper.php):
 *   0 = draft, 1 = able to sign, 2 = partially signed, 3 = signed, 4 = deleted.
 */
export const FILE_STATUS = {
  DRAFT: 0,
  ABLE_TO_SIGN: 1,
  PARTIAL_SIGNED: 2,
  SIGNED: 3,
  DELETED: 4,
} as const

/**
 * LibreSign sign-request (signer) status integers:
 *   0 = pending, 1 = signed, 2 = declined.
 */
export const SIGNER_STATUS = {
  PENDING: 0,
  SIGNED: 1,
  DECLINED: 2,
} as const
