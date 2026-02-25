import { NextApiRequest, NextApiResponse } from 'next/types';
import { CustomRealmFormData, RealmProfile } from 'types/realm-profile';

export const CustomRealms: CustomRealmFormData[] = [
  {
    id: 1,
    realm: 'realm 1',
    productName: 'name',
    purpose: 'purpose',
    primaryEndUsers: ['livingInBC', 'businessInBC', 'govEmployees', 'details'],
    preferredAdminLoginMethod: 'idir',
    productOwnerEmail: 'a@b.com',
    productOwnerIdirUserId: 'po',
    technicalContactEmail: 'b@c.com',
    technicalContactIdirUserId: 'd@e.com',
    secondTechnicalContactIdirUserId: 'dmsd',
    secondTechnicalContactEmail: 'a@b.com',
    ministry: 'ministry',
    branch: 'branch',
    division: 'division',
    approved: null,
    rcChannel: '',
    rcChannelOwnedBy: '',
    materialToSend: '',
    status: 'pending',
  },
  {
    id: 2,
    realm: 'realm 2',
    productName: 'name',
    purpose: 'purpose',
    primaryEndUsers: ['livingInBC', 'businessInBC', 'govEmployees', 'details'],
    preferredAdminLoginMethod: 'idir',
    productOwnerEmail: 'a@b.com',
    productOwnerIdirUserId: 'po',
    technicalContactEmail: 'b@c.com',
    technicalContactIdirUserId: 'd@e.com',
    secondTechnicalContactIdirUserId: 'dmsd',
    secondTechnicalContactEmail: 'a@b.com',
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
    preferredAdminLoginMethod: 'idir',
    productOwnerEmail: 'a@b.com',
    productOwnerIdirUserId: 'po',
    technicalContactEmail: 'b@c.com',
    technicalContactIdirUserId: 'd@e.com',
    secondTechnicalContactIdirUserId: 'dmsd',
    secondTechnicalContactEmail: 'a@b.com',
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
}));

export interface MockHttpRequest {
  req: NextApiRequest;
  res: NextApiResponse;
}
