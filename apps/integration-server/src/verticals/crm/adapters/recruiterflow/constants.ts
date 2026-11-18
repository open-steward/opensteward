/**
 * Recruiterflow API constants.
 *
 * Base URL: https://api.recruiterflow.com
 * Auth: RF-Api-Key header
 * Docs: https://recruiterflow.com/api (Swagger / Flasgger)
 */

export const BASE_URL = 'https://api.recruiterflow.com'

export const DEFAULT_PAGE_SIZE = 25

export const PATHS = {
  // Candidate (maps to Contact in CRM vertical)
  CANDIDATE_LIST: '/api/external/candidate/list',
  CANDIDATE_GET: '/api/external/candidate/get',
  CANDIDATE_ADD: '/api/external/candidate/add',
  CANDIDATE_UPDATE: '/api/external/candidate/update',
  CANDIDATE_NOTES_ADD: '/api/external/candidate/notes/add',
  CANDIDATE_ACTIVITY_LIST: '/api/external/candidate/activity/list',
  CANDIDATE_NOTES_LIST: '/api/external/candidate/task/list',

  // Client company (maps to Company)
  CLIENT_LIST: '/api/external/client/list',
  CLIENT_GET: '/api/external/client/get',
  CLIENT_ADD: '/api/external/client/add',
  CLIENT_UPDATE: '/api/external/client/update',
  CLIENT_NOTES_ADD: '/api/external/client/notes/add',
  CLIENT_ACTIVITY_LIST: '/api/external/client/activity/list',
} as const
