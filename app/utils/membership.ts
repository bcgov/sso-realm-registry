import { CustomRealmFormData, RealmMember, RealmMemberProfile } from 'types/realm-profile';
import { MemberRoleEnum } from 'utils/constants';

/** A stored member becomes a form row identified by `userId`, not by name or email. */
export const toFormMember = (member?: RealmMemberProfile): RealmMember | null =>
  member ? { userId: member.userId, email: member.email ?? '', idirUsername: member.idirUsername } : null;

/**
 * Fans the `members` list the server returns back out into the productOwner,
 * technicalLead and additionalUsers slots an update is validated against. Every update
 * carries the full membership, so anything that PUTs a realm it fetched — the edit form,
 * the admin approve and decline buttons — has to go through here first.
 */
export const buildFormData = (realm: CustomRealmFormData): CustomRealmFormData => {
  const members = realm.members ?? [];
  return {
    ...realm,
    productOwner: toFormMember(members.find((member) => member.role === MemberRoleEnum.PRODUCT_OWNER)),
    technicalLead: toFormMember(members.find((member) => member.role === MemberRoleEnum.TECHNICAL_LEAD)),
    additionalUsers: members
      .filter((member) => member.role === MemberRoleEnum.ADDITIONAL)
      .map((member) => toFormMember(member)),
  };
};
