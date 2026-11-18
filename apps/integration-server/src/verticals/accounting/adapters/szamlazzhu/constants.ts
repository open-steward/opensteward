// Számlázz.hu Számla Agent — all requests are XML POST to a single endpoint
// Authentication uses a "szamlaagentkulcs" (Agent Key) embedded in the XML body
export const SZAMLAZZHU_API_BASE = 'https://www.szamlazz.hu/szamla'
// User navigates here to generate their Agent Key
export const SZAMLAZZHU_SETTINGS_URL = 'https://www.szamlazz.hu/szamla/main?page=szamlaagent'

export const DEFAULT_PAGE_SIZE = 100
export const MAX_PAGE_SIZE = 500
