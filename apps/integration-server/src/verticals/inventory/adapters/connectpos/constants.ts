/**
 * ConnectPOS (Magento 2 POS) REST API constants.
 *
 * ConnectPOS is built on Magento 2 and serves its POS REST API from the
 * SM_XRetail module at {storeUrl}/xrest/index/v1?path={resource}.
 * Auth: Bearer JWT token (obtained via POST ?path=token); stored as api_key.
 */
export const XREST_PATH = '/xrest/index/v1'
export const DEFAULT_PAGE_SIZE = 100
