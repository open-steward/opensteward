/**
 * A respond-io Contact assembled from the `example` values of the documented
 * Contact / ContactFields / User schemas
 * (https://developers.respond.io/docs/api/cab9510b2994a-contact).
 */
import type { RawRespondIoContact } from '../../../../../../src/verticals/customer-support/adapters/respond-io/transform/contact'

export const DOC_CONTACT: RawRespondIoContact = {
  id: 12345,
  firstName: 'Muhammad ',
  lastName: 'Mahin',
  phone: '+60123456789',
  email: 'test@example.com',
  language: 'ms',
  profilePic: 'https://cdn.respond.io/profile_avatar.png',
  countryCode: 'MY',
  custom_fields: [{ name: 'Company Website', value: 'https://example.com' }],
  status: 'open',
  tags: ['new_customer, sales'],
  assignee: { id: 12345, firstName: 'Muhammad Mahin', lastName: 'Dar', email: 'test@example.com' },
  lifecycle: 'Hot Lead',
  created_at: 1663274081,
  isBlocked: false,
}
