/**
 * "In our APIs, we also prefix system properties with an underscore." and
 * "_id: the id of the limeobject"
 * (https://platform.docs.lime-crm.com/en/latest/development/tutorials/concepts/limetypes-and-limeobjects/).
 * The static Limeobject spec's definitions list a plain `id` instead; the
 * two first-party docs disagree, and only `_id` is read. A record without
 * it cannot be read back, so it is an error, never the string 'undefined'.
 */
export function limeObjectId(raw: { _id?: unknown }): string {
  if (typeof raw._id === 'number' || (typeof raw._id === 'string' && raw._id !== '')) {
    return String(raw._id)
  }
  throw Object.assign(new Error('Lime CRM object has no _id'), {
    statusCode: 502,
    code: 'UPSTREAM_SHAPE',
  })
}
