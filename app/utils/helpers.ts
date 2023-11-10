import prisma from './prisma';
import { diff } from 'deep-diff';

export enum RoleEnum {
  ADMIN = 'admin',
  PRODUCT_OWNER = 'po',
  TECHNICAL_LEAD = 'other',
}

export const allowedTechContactFields: string[] = [
  'ministry',
  'division',
  'branch',
  'technicalContactIdirUserId',
  'technicalContactEmail',
  'secondTechnicalContactEmail',
  'secondTechnicalContactIdirUserId',
];

export const allowedPoFields: string[] = allowedTechContactFields.concat([
  'productName',
  'primaryEndUsers',
  'productOwnerEmail',
  'productOwnerIdirUserId',
  'primaryEndUsers',
]);

export const allowedFormFields: string[] = allowedPoFields.concat([
  'realm',
  'environments',
  'purpose',
  'preferredAdminLoginMethod',
]);

export const adminOnlyFields: string[] = ['rcChannel', 'rcChannelOwnedBy', 'materialToSend'];

export const checkAdminRole = (user: any) => {
  const roles = user?.client_roles || [];
  return roles.includes('sso-admin');
};

export const getListOfMinistries = async () => {
  try {
    const ministries: any = await fetch(
      `https://catalogue.data.gov.bc.ca/api/3/action/organization_autocomplete?q=ministry`,
    );
    return ministries;
  } catch (err) {
    console.error(err);
    return [];
  }
};

export const createEvent = async (data: any) => {
  try {
    await prisma.event.create({ data });
  } catch (err) {
    console.log(err);
  }
};

export const getUpdatedProperties = (originalData: any, newData: any) => {
  return diff(originalData, newData);
};
