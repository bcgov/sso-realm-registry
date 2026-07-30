import { Roster, User, UserRoster } from '@prisma/client';
import { NextApiRequest, NextApiResponse } from 'next/types';
import { CustomRealmFormData, RealmMemberProfile, RealmProfile } from 'types/realm-profile';
import { MemberRoleEnum } from 'utils/constants';

export const PO_EMAIL = 'po@gov.bc.ca';
export const PO_IDIR = 'po';
export const TL_EMAIL = 'tl@gov.bc.ca';
export const TL_IDIR = 'tl';
export const ADDITIONAL_EMAIL = 'extra@gov.bc.ca';
export const ADDITIONAL_IDIR = 'extra';

type MemberWithUser = UserRoster & { user: User };

let nextUserId = 1;
let nextMembershipId = 1;

export const buildUser = (overrides: Partial<User> = {}): User => ({
  id: nextUserId++,
  guid: `guid-${overrides.idirUsername ?? 'user'}`,
  idirUsername: 'user',
  email: 'user@gov.bc.ca',
  displayName: 'A User',
  resolvedAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

export const buildMember = (
  role: MemberRoleEnum,
  user: Partial<User> = {},
  overrides: Partial<UserRoster> = {},
): MemberWithUser => {
  const builtUser = buildUser(user);
  return {
    id: nextMembershipId++,
    userId: builtUser.id,
    rosterId: 1,
    role,
    syncedAt: new Date(),
    removedAt: null,
    revokedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    user: builtUser,
    ...overrides,
  };
};

/** A realm with a product owner, a technical lead and one additional user, all synced. */
export const buildMembers = (): MemberWithUser[] => [
  buildMember(MemberRoleEnum.PRODUCT_OWNER, { idirUsername: PO_IDIR, email: PO_EMAIL, guid: 'guid-po' }),
  buildMember(MemberRoleEnum.TECHNICAL_LEAD, { idirUsername: TL_IDIR, email: TL_EMAIL, guid: 'guid-tl' }),
  buildMember(MemberRoleEnum.ADDITIONAL, {
    idirUsername: ADDITIONAL_IDIR,
    email: ADDITIONAL_EMAIL,
    guid: 'guid-extra',
  }),
];

export const serializedMembers = (members: MemberWithUser[]): RealmMemberProfile[] =>
  members.map((member) => ({
    id: member.id,
    userId: member.userId,
    role: member.role as RealmMemberProfile['role'],
    idirUsername: member.user.idirUsername,
    email: member.user.email,
    displayName: member.user.displayName,
    resolvedAt: member.user.resolvedAt?.toISOString() ?? null,
    syncedAt: member.syncedAt?.toISOString() ?? null,
  }));

const defaultMembers = serializedMembers(buildMembers());

export const CustomRealms: CustomRealmFormData[] = [
  {
    id: 1,
    realm: 'realm 1',
    productName: 'name',
    purpose: 'purpose',
    primaryEndUsers: ['livingInBC', 'businessInBC', 'govEmployees', 'details'],
    preferredAdminLoginMethod: 'azureidir',
    productOwner: null,
    technicalLead: null,
    additionalUsers: [],
    members: defaultMembers,
    ministry: 'ministry',
    branch: 'branch',
    division: 'division',
    approved: null,
    materialToSend: '',
    status: 'pending',
  },
  {
    id: 2,
    realm: 'realm 2',
    productName: 'name',
    purpose: 'purpose',
    primaryEndUsers: ['livingInBC', 'businessInBC', 'govEmployees', 'details'],
    preferredAdminLoginMethod: 'azureidir',
    productOwner: null,
    technicalLead: null,
    additionalUsers: [],
    members: defaultMembers,
    ministry: 'ministry',
    branch: 'branch',
    division: 'division',
    approved: null,
    status: 'pending',
  },
  {
    id: 3,
    realm: 'realm 3',
    productName: 'name',
    purpose: 'purpose',
    primaryEndUsers: ['livingInBC', 'businessInBC', 'govEmployees', 'details'],
    preferredAdminLoginMethod: 'azureidir',
    productOwner: null,
    technicalLead: null,
    additionalUsers: [],
    members: defaultMembers,
    ministry: 'ministry',
    branch: 'branch',
    division: 'division',
    approved: false,
    status: 'pending',
  },
];

export const CustomRealmProfiles: RealmProfile[] = CustomRealms.map((realm) => ({
  ...realm,
  environments: ['dev', 'test', 'prod'],
  productOwnerName: 'po',
  branch: 'main',
  displayName: realm.realm,
  openshiftNamespace: 'namespace',
  willingToMove: 'yes',
  whenToMove: '',
  createdAt: '',
  updatedAt: '',
  status: 'pending',
  outOfSync: false,
}));

export const roster: Roster = {
  id: 1,
  realm: 'realm 1',
  productName: 'name',
  purpose: 'purpose',
  primaryEndUsers: ['livingInBC', 'businessInBC', 'govEmployees', 'details'],
  preferredAdminLoginMethod: 'azureidir',
  // Retired columns, kept on the model until they are dropped in a follow up change.
  productOwnerEmail: null,
  productOwnerIdirUserId: null,
  technicalContactEmail: null,
  technicalContactIdirUserId: null,
  secondTechnicalContactIdirUserId: null,
  secondTechnicalContactEmail: null,
  ministry: 'ministry',
  branch: 'branch',
  division: 'division',
  approved: null,
  materialToSend: '',
  status: 'applied',
  createdAt: new Date(),
  lastUpdatedBy: 'user',
  updatedAt: new Date(),
  environments: ['dev', 'test', 'prod'],
  prNumber: 1,
  requestor: 'user',
  archived: false,
};

export interface MockHttpRequest {
  req: NextApiRequest;
  res: NextApiResponse;
}
