import { createMocks } from 'node-mocks-http';
import handler from '../../pages/api/realms/[id]';
import prisma from 'utils/prisma';
import { CustomRealmProfiles, MockHttpRequest } from '../fixtures';
import { getServerSession } from 'next-auth';
import { createCustomRealm } from 'controllers/keycloak';

jest.mock('../../utils/mailer', () => {
  return {
    sendUpdateEmail: jest.fn(),
    sendDeleteEmail: jest.fn(),
    sendReadyToUseEmail: jest.fn(),
  };
});

jest.mock('../../utils/idir', () => {
  return {
    generateXML: jest.fn(),
    makeSoapRequest: jest.fn(() => Promise.resolve({ response: null })),
    getBceidAccounts: jest.fn(() => Promise.resolve([])),
  };
});

jest.mock('../../controllers/keycloak.ts', () => {
  return {
    createCustomRealm: jest.fn(() => true),
    disableCustomRealm: jest.fn(() => true),
    addUserAsRealmAdmin: jest.fn(() => true),
  };
});

jest.mock('next-auth/next', () => {
  return {
    __esModule: true,
    getServerSession: jest.fn(() => {
      return {
        expires: new Date(Date.now() + 2 * 86400).toISOString(),
        user: {
          username: 'test',
          family_name: 'test',
        },
        status: 'authenticated',
      };
    }),
  };
});

jest.mock('../../pages/api/auth/[...nextauth]', () => {
  return {
    __esModule: true,
    authOptions: {},
  };
});

const technicalContactAllowedFields = [
  'technicalContactEmail',
  'technicalContactIdirUserId',
  'secondTechnicalContactIdirUserId',
  'secondTechnicalContactEmail',
  'ministry',
  'division',
  'branch',
];
const productOwnerAllowedFields = [
  ...technicalContactAllowedFields,
  'purpose',
  'productName',
  'primaryEndUsers',
  'productOwnerEmail',
  'productOwnerIdirUserId',
];

const adminAllowedFields = [
  ...productOwnerAllowedFields,
  'rcChannel',
  'rcChannelOwnedBy',
  'materialToSend',
  'approved',
];

const allFields = Object.keys(CustomRealmProfiles[0]);
const technicalContactRestrictedFields = allFields.filter((field) => !technicalContactAllowedFields.includes(field));
const productOwnerRestrictedFields = allFields.filter((field) => !productOwnerAllowedFields.includes(field));

describe('Profile Validations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  it('Only allows technical contact to update expected fields', async () => {
    (prisma.roster.findUnique as jest.Mock).mockImplementation(() => {
      return Promise.resolve(CustomRealmProfiles[0]);
    });
    const { req, res }: MockHttpRequest = createMocks({
      method: 'PUT',
      body: CustomRealmProfiles[0],
    });
    await handler(req, res);
    const profileUpdate = prisma.roster.update as jest.Mock;

    // Fields passed into db update
    const updatedFields = Object.keys(profileUpdate.mock.calls[0][0].data);
    technicalContactAllowedFields.forEach((field) => expect(updatedFields.includes(field)).toBeTruthy());
    technicalContactRestrictedFields.forEach((field) => expect(updatedFields.includes(field)).toBeFalsy());
  });

  it('Only allows the product owner to update expected fields', async () => {
    (prisma.roster.findUnique as jest.Mock).mockImplementation(() => {
      return Promise.resolve(CustomRealmProfiles[0]);
    });
    (getServerSession as jest.Mock).mockImplementation(() => {
      return {
        expires: new Date(Date.now() + 2 * 86400).toISOString(),
        user: {
          idir_username: 'po',
        },
        status: 'authenticated',
      };
    });
    const { req, res }: MockHttpRequest = createMocks({
      method: 'PUT',
      body: CustomRealmProfiles[0],
    });
    await handler(req, res);
    const profileUpdate = prisma.roster.update as jest.Mock;

    // Fields passed into db update
    const updatedFields = Object.keys(profileUpdate.mock.calls[0][0].data);
    productOwnerAllowedFields.forEach((field) => expect(updatedFields.includes(field)).toBeTruthy());
    productOwnerRestrictedFields.forEach((field) => expect(updatedFields.includes(field)).toBeFalsy());
  });

  it('Allows admins to update expected fields', async () => {
    (prisma.roster.findUnique as jest.Mock).mockImplementation(() => {
      return Promise.resolve(CustomRealmProfiles[0]);
    });
    (getServerSession as jest.Mock).mockImplementation(() => {
      return {
        expires: new Date(Date.now() + 2 * 86400).toISOString(),
        user: {
          username: 'test',
          client_roles: ['sso-admin'],
        },
        status: 'authenticated',
      };
    });
    const { req, res }: MockHttpRequest = createMocks({
      method: 'PUT',
      body: CustomRealmProfiles[0],
    });
    await handler(req, res);
    const profileUpdate = prisma.roster.update as jest.Mock;

    // Fields passed into db update
    const updatedFields = Object.keys(profileUpdate.mock.calls[0][0].data);
    adminAllowedFields.forEach((field) => expect(updatedFields.includes(field)).toBeTruthy());
  });

  it('does not allow to update rejected realms', async () => {
    (prisma.roster.findUnique as jest.Mock).mockImplementation(() => {
      return Promise.resolve({ ...CustomRealmProfiles[0], approved: false });
    });
    const { req, res }: MockHttpRequest = createMocks({
      method: 'PUT',
      query: { id: 1 },
    });
    await handler(req, res);
    expect(res.statusCode).toBe(400);
  });

  it('calls kc admin api to create realm in all environments', async () => {
    (prisma.roster.findUnique as jest.Mock).mockImplementation(() => {
      return Promise.resolve(CustomRealmProfiles[0]);
    });

    (prisma.roster.update as jest.Mock).mockImplementation(() => {
      return Promise.resolve({ ...CustomRealmProfiles[0], approved: true });
    });
    (getServerSession as jest.Mock).mockImplementation(() => {
      return {
        expires: new Date(Date.now() + 2 * 86400).toISOString(),
        user: {
          username: 'test',
          client_roles: ['sso-admin'],
        },
        status: 'authenticated',
      };
    });
    const { req, res }: MockHttpRequest = createMocks({
      method: 'PUT',
      body: { ...CustomRealmProfiles[0], approved: true },
      query: { id: 1 },
    });
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(createCustomRealm).toHaveBeenCalledTimes(3);
  });
});
