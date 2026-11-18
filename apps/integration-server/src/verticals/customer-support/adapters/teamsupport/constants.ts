/**
 * TeamSupport REST API constants.
 *
 * Base URL: https://app.teamsupport.com
 * All endpoints are under /api/json/ and accept/return JSON.
 * Authentication: HTTP Basic Auth with OrganizationID (username) and APIToken (password).
 */
export const API_BASE_URL = 'https://app.teamsupport.com'

export const PATHS = {
  tickets: '/api/json/tickets.json',
  ticket: (id: string) => `/api/json/tickets/${id}.json`,
  ticketActions: (ticketId: string) => `/api/json/tickets/${ticketId}/actions.json`,
  customers: '/api/json/customers.json',
  customer: (id: string) => `/api/json/customers/${id}.json`,
  contacts: '/api/json/contacts.json',
  contact: (id: string) => `/api/json/contacts/${id}.json`,
  users: '/api/json/users.json',
  user: (id: string) => `/api/json/users/${id}.json`,
  groups: '/api/json/groups.json',
  group: (id: string) => `/api/json/groups/${id}.json`,
} as const

export const DEFAULT_PAGE_SIZE = 100
