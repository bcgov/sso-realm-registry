export const MICROSOFT_TEAMS_CHANNEL_LINK =
  'https://teams.microsoft.com/l/channel/19%3A35d0b3389e39479590ba45a19a67a3ba%40thread.tacv2/SSOKeycloak-howto?groupId=a80418da-c27b-406e-89ab-7695b61924d8&tenantId=6fdb5200-3d0d-4a8a-b036-d3685e359adc';

/** A realm may name a product owner, a technical lead, and up to this many extra users. */
export const MAX_ADDITIONAL_USERS = 10;

export enum MemberRoleEnum {
  PRODUCT_OWNER = 'product_owner',
  TECHNICAL_LEAD = 'technical_lead',
  ADDITIONAL = 'additional',
}
