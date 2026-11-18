/**
 * Fixtures copied from the documented example responses in Helpwise's
 * first-party API collection
 * (https://documenter.getpostman.com/view/29744652/2s9YC5yYKf, V1 folder;
 * collection JSON at
 * https://documenter.gw.postman.com/api/collections/29744652/2s9YC5yYKf?segregateAuth=true&versionTag=latest).
 */

/** "List Contact" (GET https://apis.helpwise.io/contacts?limit=<LIMIT>&offset=<OFFSET>), results[0]. */
export const DOC_CONTACT = {
  firstname: 'John',
  middlename: '',
  lastname: 'Doe',
  jobTitle: '',
  company: '',
  emails: ['john.doe@saaslabs.co'],
  phones: [],
  id: 1,
}

/** "Get Contact" (GET https://apis.helpwise.io/contacts/{{contactId}}), trimmed of its threads list. */
export const DOC_CONTACT_GET = {
  id: 17864809,
  firstname: 'Ashroof',
  displayName: 'Ashroof',
  displayContact: 'Ashroof',
  emails: ['ashroof@helpwise.io'],
  phones: [],
  isBlocked: false,
  notes: [],
  groups: [{ id: 204654, name: 'Testing' }],
  customFields: null,
}

/** "Get Tags" (GET https://apis.helpwise.io/tags), element [0]. */
export const DOC_TAG = {
  id: 1,
  name: 'Tag 1',
  color: 'rgb(208, 215, 216)',
  parentId: 2,
  hierarchy: null,
  inbox: 'Helpwise Support',
  createdAt: '2022-08-31 16:50:38',
  pinnedBy: null,
}

/** "Get Tag" (GET https://apis.helpwise.io/tags/{{tagId}}). */
export const DOC_TAG_GET = {
  id: 1,
  name: 'Tag 1',
  color: '#FF0000',
  parentId: 2,
  hierarchy: null,
  inbox: 'Helpwise Support',
  createdAt: '2023-07-04 11:48:04',
  pinnedBy: null,
}
