/**
 * Samdock's production server, as its OpenAPI names it:
 * `"servers": [{ "description": "Samdock Sandbox API", "url": "https://stage.samdock.app/" },
 * { "description": "Samdock Production API", "url": "https://samdock.app/" }]`
 * (https://samdock.readme.io/reference/personscontroller_browse.md).
 * Every documented path already starts with `/api/…`, so the base is the bare host.
 */
export const BASE_URL = 'https://samdock.app'
