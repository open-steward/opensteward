/**
 * The documented example response of
 * `GET /public/v2/documents/{document_id}/audit-trail`, verbatim
 * ("A paginated audit trail list"):
 * https://developers.pandadoc.com/reference/list-document-audit-trail
 */
export const AUDIT_TRAIL_EXAMPLE = {
  count: 3,
  results: [
    {
      id: 'V9aG9KSREgTE8GnMqxWyzf',
      user: {
        id: 'FA5QAu8UGA3oVDQZuPL75B',
        email: 'pandadoc@pandadoc.com',
      },
      action: 1,
      reason: null,
      date_created: '2025-05-22T09:03:19Z',
      ip_address: '8.8.8.8',
    },
    {
      id: 'bWuXeU2bsToNyheeXfENAQ',
      user: {
        id: 'FA5QAu8UGA3oVDQZuPL75B',
        email: 'pandadoc@pandadoc.com',
      },
      action: 6,
      reason: '',
      date_created: '2025-05-22T09:03:49Z',
      ip_address: '8.8.8.8',
    },
    {
      id: 'TkgpWurccyfAZv9kazRs3D',
      user: {
        id: '6A3gGiRY7TQp4PHBqCpEjG',
        email: 'astronaut@nasa.com',
      },
      action: 8,
      reason: null,
      date_created: '2025-05-22T09:06:42Z',
      ip_address: '128.156.0.0',
    },
  ],
}

/** The document id the endpoint's `document_id` parameter documents as its example. */
export const EXAMPLE_DOCUMENT_ID = 'BhVzRcxH9Z2LgfPPGXFUBa'
