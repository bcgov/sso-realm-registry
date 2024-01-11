import prisma from './prisma';
import { diff } from 'deep-diff';
import getConfig from 'next/config';

const { serverRuntimeConfig = {} } = getConfig() || {};
const { dev_kc_url, test_kc_url, prod_kc_url } = serverRuntimeConfig;

export const wikiURL = 'https://mvp.developer.gov.bc.ca/docs/default/component/css-docs';

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

export const allowedFormFields: string[] = allowedPoFields.concat(['realm', 'environments', 'purpose']);

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
    console.error(err);
  }
};

export const getUpdatedProperties = (originalData: any, newData: any) => {
  return diff(originalData, newData);
};

export const generateRealmLinksByEnv = (env: string, realmName: string) => {
  const domain = env === 'dev' ? dev_kc_url : env === 'test' ? test_kc_url : prod_kc_url;
  return `${domain}/auth/admin/${realmName}/console/`;
};

export const generateMasterRealmLinksByEnv = (env: string, realmName: string) => {
  const domain = env === 'dev' ? dev_kc_url : env === 'test' ? test_kc_url : prod_kc_url;
  return `${domain}/auth/admin/master/console/#/realms/${realmName}`;
};
