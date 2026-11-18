/**
 * Records shaped as the REST API Query resource returns them: each row has
 * `attributes: { type, url }` and the selected fields ("records": [{
 * "attributes": { "type": "Account", "url":
 * "/services/data/v67.0/sobjects/Account/001D000000IRFmaIAH" }, "Name": ...}]).
 * https://developer.salesforce.com/docs/atlas.en-us.api_rest.meta/api_rest/dome_query.htm
 *
 * Field names are from the Object Reference pages cited in each transform.
 * Values are test data.
 */
import type { RawSalesforceCase } from '../../../../../../src/verticals/customer-support/adapters/salesforce-service/transform/ticket'
import type {
  RawSalesforceCaseComment,
  RawSalesforceEmailMessage,
} from '../../../../../../src/verticals/customer-support/adapters/salesforce-service/transform/message'
import type { RawSalesforceContact } from '../../../../../../src/verticals/customer-support/adapters/salesforce-service/transform/contact'
import type { RawSalesforceUser } from '../../../../../../src/verticals/customer-support/adapters/salesforce-service/transform/user'
import type { RawSalesforceGroup } from '../../../../../../src/verticals/customer-support/adapters/salesforce-service/transform/team'

export const INSTANCE_URL = 'https://mycompany.my.salesforce.com'

function attrs(type: string, id: string) {
  return { type, url: `/services/data/v60.0/sobjects/${type}/${id}` }
}

export const CASE: RawSalesforceCase = {
  attributes: attrs('Case', '500D000000IRFmaIAH'),
  Id: '500D000000IRFmaIAH',
  CaseNumber: '00001026',
  Subject: 'Unable to log in',
  Status: 'Working',
  IsClosed: false,
  ClosedDate: null,
  Priority: 'High',
  Origin: 'Email',
  ContactId: '003D000000QOVoIIAX',
  AccountId: '001D000000IRFmaIAH',
  OwnerId: '005D0000005Bk90IAC',
  Owner: { Type: 'User' },
  ParentId: null,
  CreatedDate: '2026-01-15T09:30:00.000+0000',
  LastModifiedDate: '2026-02-01T14:20:00.000+0000',
}

export const CLOSED_QUEUE_CASE: RawSalesforceCase = {
  attributes: attrs('Case', '500D000000IRFmbIAH'),
  Id: '500D000000IRFmbIAH',
  CaseNumber: '00001027',
  Subject: 'Refund',
  Status: 'Closed',
  IsClosed: true,
  ClosedDate: '2026-02-03T08:00:00.000+0000',
  Priority: 'Medium',
  Origin: 'Phone',
  ContactId: '003D000000QOVoJIAX',
  AccountId: null,
  OwnerId: '00GD0000001aBcDMAU',
  Owner: { Type: 'Group' },
  ParentId: '500D000000IRFmaIAH',
  CreatedDate: '2026-02-01T10:00:00.000+0000',
  LastModifiedDate: '2026-02-03T08:00:00.000+0000',
}

export const CASE_COMMENT: RawSalesforceCaseComment = {
  attributes: attrs('CaseComment', '00aD000000abcdeIAA'),
  Id: '00aD000000abcdeIAA',
  ParentId: '500D000000IRFmaIAH',
  CommentBody: 'Reset the password and asked the customer to retry.',
  IsPublished: false,
  CreatedById: '005D0000005Bk90IAC',
  CreatedDate: '2026-01-15T10:00:00.000+0000',
  LastModifiedDate: '2026-01-15T10:00:00.000+0000',
}

export const EMAIL_MESSAGE: RawSalesforceEmailMessage = {
  attributes: attrs('EmailMessage', '02sD000000abcdeIAA'),
  Id: '02sD000000abcdeIAA',
  ParentId: '500D000000IRFmaIAH',
  Subject: 'Re: Unable to log in',
  TextBody: 'I still cannot log in.',
  FromAddress: 'jane.doe@acme.example',
  FromId: '003D000000QOVoIIAX',
  Incoming: true,
  HasAttachment: true,
  Status: '0',
  MessageDate: '2026-01-15T11:00:00.000+0000',
  CreatedById: '005D0000005Bk91IAC',
  CreatedDate: '2026-01-15T11:00:05.000+0000',
  LastModifiedDate: '2026-01-15T11:00:05.000+0000',
}

export const CONTACT: RawSalesforceContact = {
  attributes: attrs('Contact', '003D000000QOVoIIAX'),
  Id: '003D000000QOVoIIAX',
  Name: 'Jane Doe',
  Email: 'jane.doe@acme.example',
  Phone: '+14155550123',
  AccountId: '001D000000IRFmaIAH',
  CreatedDate: '2025-11-01T09:00:00.000+0000',
  LastModifiedDate: '2026-01-10T09:00:00.000+0000',
}

export const USER: RawSalesforceUser = {
  attributes: attrs('User', '005D0000005Bk90IAC'),
  Id: '005D0000005Bk90IAC',
  Name: 'Olivia Admin',
  Email: 'olivia.admin@northwind.example',
  IsActive: true,
  UserType: 'Standard',
  UserRoleId: '00ED0000000abcdMAA',
  CreatedDate: '2025-01-01T09:00:00.000+0000',
  LastModifiedDate: '2026-01-01T09:00:00.000+0000',
}

export const QUEUE: RawSalesforceGroup = {
  attributes: attrs('Group', '00GD0000001aBcDMAU'),
  Id: '00GD0000001aBcDMAU',
  Name: 'Tier 1 Support',
  DeveloperName: 'Tier_1_Support',
  Type: 'Queue',
  Email: 'tier1@northwind.example',
  CreatedDate: '2025-01-01T09:00:00.000+0000',
  LastModifiedDate: '2025-06-01T09:00:00.000+0000',
}
