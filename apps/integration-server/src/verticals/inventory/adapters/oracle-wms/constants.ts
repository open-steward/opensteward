/**
 * Oracle Warehouse Management Cloud — constants
 *
 * Base URL template: https://{wms_domain}/{env_name}/wms/lgfapi/v10
 * The domain and env-name are tenant-specific (stored in credentials.extra).
 *
 * Docs: https://docs.oracle.com/en/cloud/saas/warehouse-management/26a/owmre/
 */

/** Maximum page_size accepted by lgfapi (hard cap 1250) */
export const DEFAULT_PAGE_SIZE = 100
export const MAX_PAGE_SIZE = 1250

/** lgfapi entity path prefix (relative to per-tenant base) */
export const ENTITY_PATH = '/wms/lgfapi/v10/entity'

/** WMS hosts are `{cluster}.wms.ocs.oraclecloud.com` (WMS REST API Guide examples). */
export const WMS_HOST_SUFFIX = '.wms.ocs.oraclecloud.com'

/** WMS IDCS identity domains are `idcs-{tenant}.identity.oraclecloud.com`. */
export const IDCS_HOST_SUFFIX = '.identity.oraclecloud.com'

/** Token endpoint path on the WMS IDCS identity domain. */
export const IDCS_TOKEN_PATH = '/oauth2/v1/token'

/**
 * WMS resource scope defined in WMS IDCS (primary audience
 * `urn:resource:fusion:scm:logistics:wms:` + scope `lgfapi/`).
 */
export const LGFAPI_SCOPE = 'urn:resource:fusion:scm:logistics:wms:lgfapi/'
