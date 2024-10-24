import { createMocks } from 'node-mocks-http';
import handler from '../../pages/api/realms/[id]';
import prisma from 'utils/prisma';
import { CustomRealmProfiles, CustomRealms, MockHttpRequest } from '../fixtures';
import { getServerSession } from 'next-auth';
import { manageCustomRealm } from 'controllers/keycloak';
import { createEvent } from 'utils/helpers';
import { EventEnum } from 'validators/create-realm';
import { createMockSendEmail } from './utils/mocks';
import { ssoTeamEmail } from 'utils/mailer';

jest.mock('../../utils/helpers', () => {
  return {
    ...jest.requireActual('../../utils/helpers'),
    createEvent: jest.fn(),
  };
});

jest.mock('utils/ches');

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
    manageCustomRealm: jest.fn(() => true),
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
});

describe('approval and rejection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  it('calls kc admin api to create realm in all environments after approval', async () => {
    (prisma.roster.findUnique as jest.Mock).mockImplementation(() => {
      return Promise.resolve(CustomRealmProfiles[0]);
    });

    (prisma.roster.update as jest.Mock).mockImplementation(() => {
      return Promise.resolve({ ...CustomRealms[0], approved: true });
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

    const emailList = createMockSendEmail();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(createEvent).toHaveBeenCalledTimes(3);
    const createEventArgs0 = (createEvent as jest.Mock).mock.calls[0][0];
    expect(createEventArgs0.eventCode).toBe(EventEnum.REQUEST_APPROVE_SUCCESS);
    const createEventArgs1 = (createEvent as jest.Mock).mock.calls[1][0];
    expect(createEventArgs1.eventCode).toBe(EventEnum.REQUEST_APPLY_SUCCESS);
    const createEventArgs2 = (createEvent as jest.Mock).mock.calls[2][0];
    expect(createEventArgs2.eventCode).toBe(EventEnum.REQUEST_UPDATE_SUCCESS);
    expect(manageCustomRealm).toHaveBeenCalledTimes(1);
    expect(emailList.length).toBe(2);
    expect(emailList[0].to).toEqual(
      expect.arrayContaining([CustomRealms[0].productOwnerEmail, CustomRealms[0].technicalContactEmail]),
    );
    expect(emailList[1].to).toEqual(
      expect.arrayContaining([CustomRealms[0].productOwnerEmail, CustomRealms[0].technicalContactEmail]),
    );
    expect(emailList[0].cc).toEqual(expect.arrayContaining([ssoTeamEmail]));
    expect(emailList[1].cc).toEqual(expect.arrayContaining([ssoTeamEmail]));
    expect(emailList[0].subject).toBe(
      'Important: Your request for Custom Realm realm 1 has been Approved (email 1 of 2)',
    );
    expect(emailList[1].subject).toBe(
      'Important: Custom Realm realm 1 Created and Action Required for Realm Admin Configuration (email 2 of 2)',
    );
  });

  it('does not call kc admin api to create realm in all environments after rejection', async () => {
    (prisma.roster.findUnique as jest.Mock).mockImplementation(() => {
      return Promise.resolve(CustomRealmProfiles[0]);
    });

    (prisma.roster.update as jest.Mock).mockImplementation(() => {
      return Promise.resolve({ ...CustomRealms[0], approved: false });
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
      body: { ...CustomRealmProfiles[0], approved: false },
      query: { id: 1 },
    });

    const emailList = createMockSendEmail();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(manageCustomRealm).not.toHaveBeenCalled();

    expect(createEvent).toHaveBeenCalledTimes(2);

    const createEventArgs0 = (createEvent as jest.Mock).mock.calls[0][0];
    expect(createEventArgs0.eventCode).toBe(EventEnum.REQUEST_REJECT_SUCCESS);

    const createEventArgs1 = (createEvent as jest.Mock).mock.calls[1][0];
    expect(createEventArgs1.eventCode).toBe(EventEnum.REQUEST_UPDATE_SUCCESS);

    expect(emailList.length).toBe(1);
    expect(emailList[0].subject).toContain('Important: Your request for Custom Realm realm 1 has been Declined');
    expect(emailList[0].to).toEqual(
      expect.arrayContaining([CustomRealms[0].productOwnerEmail, CustomRealms[0].technicalContactEmail]),
    );
    expect(emailList[0].cc).toEqual(expect.arrayContaining([ssoTeamEmail]));
  });
});
