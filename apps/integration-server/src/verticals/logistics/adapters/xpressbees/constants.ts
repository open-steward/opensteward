/**
 * Xpressbees "Custom API" (first-party Postman collection
 * https://documenter.getpostman.com/view/15188467/2s9YyzcxWT and the PDF
 * https://xb-ucp-files-s3.xbees.in/assets/custom_api/apidoc_v1.1.5.pdf).
 * Every documented URL is under https://shipment.xpressbees.com/api/.
 */
export const XPRESSBEES_API_BASE = 'https://shipment.xpressbees.com/api/'
/** "Generate Token | POST https://shipment.xpressbees.com/api/users/login" */
export const XPRESSBEES_LOGIN_URL = `${XPRESSBEES_API_BASE}users/login`

export const RATE_LIMIT_RPS = 10
