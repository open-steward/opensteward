/**
 * ECCANG (易仓科技) ERP Open API constants.
 *
 * ECCANG exposes a unified POST gateway at /openApi/api/appUnity.
 * Each request selects the operation via the `interface_method` body field.
 * Auth: appKey header + per-request token + subject_code (tenant id).
 */
export const API_BASE_URL = 'https://open.eccang.com'
export const API_PATH = '/openApi/api/appUnity'
export const SYSTEM_NAME = 'ERP'
export const API_VERSION = 'V1.0.0'
export const DEFAULT_PAGE_SIZE = 50
