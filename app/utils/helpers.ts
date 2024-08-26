import prisma from './prisma';
import { diff } from 'deep-diff';
import getConfig from 'next/config';

const { serverRuntimeConfig = {} } = getConfig() || {};
const { dev_kc_url, test_kc_url, prod_kc_url } = serverRuntimeConfig;

export const formatWikiURL = (page?: string) =>
  `https://mvp.developer.gov.bc.ca/docs/default/component/css-docs/${
    page ?? ''
  }?utm_source=sso-wiki&utm_medium=web&utm_campaign=retirement-notice-sso`;

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

export const getRealmPermissionsByRole = (realmName: string) => {
  return [
    {
      name: 'realm-admin',
      permissions: ['realm-admin'],
      group: 'Realm Administrator',
      realmName,
      clientId: 'realm-management',
    },
    {
      name: 'realm-viewer',
      permissions: [
        'view-realm',
        'view-users',
        'view-clients',
        'view-identity-providers',
        'view-authorization',
        'view-events',
      ],
      group: 'Realm Viewer',
      realmName,
      clientId: 'realm-management',
    },
    {
      name: `${realmName}-realm-admin`,
      permissions: [
        'create-client',
        'impersonation',
        'manage-authorization',
        'manage-clients',
        'manage-events',
        'manage-identity-providers',
        'manage-realm',
        'manage-users',
        'query-clients',
        'query-groups',
        'query-realms',
        'query-users',
        'view-authorization',
        'view-clients',
        'view-events',
        'view-identity-providers',
        'view-realm',
        'view-users',
      ],
      group: `${realmName} Realm Administrator`,
      realmName: 'master',
      clientId: `${realmName}-realm`,
    },
  ];
};
