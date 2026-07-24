import { createMocks } from 'node-mocks-http';
import handler from '../../pages/api/realms/[id]';
import prisma from 'utils/prisma';
import { CustomRealmProfiles, CustomRealms, MockHttpRequest } from '../fixtures';
import { getServerSession } from 'next-auth';
import { addUserAsRealmAdmin, manageCustomRealm, removeUserAsRealmAdmin } from 'controllers/keycloak';
import { fetchIdirUser } from 'controllers/msal';
import { createEvent } from 'utils/helpers';
import { EventEnum, StatusEnum } from 'validators/create-realm';
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
    buildMasterUsername: (guid: string) => `${guid.toLowerCase()}@azureidir`,
    createCustomRealm: jest.fn(() => true),
    disableCustomRealm: jest.fn(() => true),
    ensureMasterRealmAdminGroup: jest.fn(),
    addUserAsRealmAdmin: jest.fn(),
    removeUserAsRealmAdmin: jest.fn(),
    manageCustomRealm: jest.fn(() => true),
  };
});

jest.mock('../../controllers/msal', () => {
  return {
    fetchIdirUser: jest.fn(),
  };
});

jest.mock('next-auth/next', () => {
  return {
    __esModule: true,
    getServerSession: jest.fn(() => {
      return {
        expires: new Date(Date.now() + 2 * 86400).toISOString(),
        user: {
          idir_username: 'test',
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

const adminAllowedFields = [...productOwnerAllowedFields, 'materialToSend', 'approved'];

const allFields = Object.keys(CustomRealmProfiles[0]);
const technicalContactRestrictedFields = allFields.filter((field) => !technicalContactAllowedFields.includes(field));
const productOwnerRestrictedFields = allFields.filter((field) => !productOwnerAllowedFields.includes(field));

const mockUserSession = (username: string) => {
  (getServerSession as jest.Mock).mockReset();
  (getServerSession as jest.Mock).mockImplementation(() => {
    return {
      expires: new Date(Date.now() + 2 * 86400).toISOString(),
      user: {
        idir_username: username,
      },
      status: 'authenticated',
    };
  });
};

describe('Profile Validations', () => {
  const PO_IDIR_ID = 'po';
  const TC_IDIR_ID = 'tc';
  const TC2_IDIR_ID = 'tc2';
  const testRoster = {
    ...CustomRealmProfiles[0],
    productOwnerIdirUserId: PO_IDIR_ID,
    technicalContactIdirUserId: TC_IDIR_ID,
    secondTechnicalContactIdirUserId: TC2_IDIR_ID,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.roster.findUnique as jest.Mock).mockImplementation(() => {
      return Promise.resolve(testRoster);
    });
  });

  it('Returns 401 on unauthorized update', async () => {
    mockUserSession('some_user');
    const { req, res }: MockHttpRequest = createMocks({
      method: 'PUT',
      body: testRoster,
    });
    await handler(req, res);
    expect(res.statusCode).toBe(401);
  });

  it('Only allows technical contact to update expected fields', async () => {
    mockUserSession(TC2_IDIR_ID);
    const { req, res }: MockHttpRequest = createMocks({
      method: 'PUT',
      body: testRoster,
    });
    await handler(req, res);
    const profileUpdate = prisma.roster.update as jest.Mock;

    // Fields passed into db update
    const updatedFields = Object.keys(profileUpdate.mock.calls[0][0].data);
    technicalContactAllowedFields.forEach((field) => expect(updatedFields.includes(field)).toBeTruthy());
    technicalContactRestrictedFields.forEach((field) => expect(updatedFields.includes(field)).toBeFalsy());
  });

  it('Only allows the product owner to update expected fields', async () => {
    mockUserSession(PO_IDIR_ID);
    const { req, res }: MockHttpRequest = createMocks({
      method: 'PUT',
      body: testRoster,
    });
    await handler(req, res);
    const profileUpdate = prisma.roster.update as jest.Mock;

    // Fields passed into db update
    const updatedFields = Object.keys(profileUpdate.mock.calls[0][0].data);
    productOwnerAllowedFields.forEach((field) => expect(updatedFields.includes(field)).toBeTruthy());
    productOwnerRestrictedFields.forEach((field) => expect(updatedFields.includes(field)).toBeFalsy());
  });

  it('Allows admins to update expected fields', async () => {
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
      body: testRoster,
    });
    await handler(req, res);
    const profileUpdate = prisma.roster.update as jest.Mock;

    // Fields passed into db update
    const updatedFields = Object.keys(profileUpdate.mock.calls[0][0].data);
    adminAllowedFields.forEach((field) => expect(updatedFields.includes(field)).toBeTruthy());
  });

  it('does not allow to update rejected realms', async () => {
    mockUserSession(PO_IDIR_ID);
    (prisma.roster.findUnique as jest.Mock).mockImplementation(() => {
      return Promise.resolve({ ...testRoster, approved: false });
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
    (fetchIdirUser as jest.Mock).mockImplementation(({ userId }: { userId: string }) =>
      Promise.resolve({ guid: `${userId}-guid`, userId }),
    );
    (addUserAsRealmAdmin as jest.Mock).mockImplementation(() => Promise.resolve());
    (removeUserAsRealmAdmin as jest.Mock).mockImplementation(() => Promise.resolve());
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
    expect(createEvent).toHaveBeenCalledTimes(4);
    const createEventArgs0 = (createEvent as jest.Mock).mock.calls[0][0];
    expect(createEventArgs0.eventCode).toBe(EventEnum.REQUEST_APPROVE_SUCCESS);
    const createEventArgs1 = (createEvent as jest.Mock).mock.calls[1][0];
    expect(createEventArgs1.eventCode).toBe(EventEnum.REQUEST_APPLY_SUCCESS);
    const createEventArgs2 = (createEvent as jest.Mock).mock.calls[2][0];
    expect(createEventArgs2.eventCode).toBe(EventEnum.REQUEST_UPDATE_SUCCESS);
    const createEventArgs3 = (createEvent as jest.Mock).mock.calls[3][0];
    expect(createEventArgs3.eventCode).toBe(EventEnum.REQUEST_ACCESS_SYNC_SUCCESS);
    expect(manageCustomRealm).toHaveBeenCalledTimes(1);
    // Approval grants access to both managed contacts, awaited before responding
    expect(addUserAsRealmAdmin).toHaveBeenCalledWith(
      `${CustomRealmProfiles[0].productOwnerIdirUserId}-guid@azureidir`,
      ['dev'],
      CustomRealms[0].realm,
    );
    expect(addUserAsRealmAdmin).toHaveBeenCalledTimes(6);
    expect(emailList.length).toBe(2);
    expect(emailList[0].to).toEqual(
      expect.arrayContaining([
        CustomRealms[0].productOwnerEmail,
        CustomRealms[0].technicalContactEmail,
        CustomRealms[0].secondTechnicalContactEmail,
      ]),
    );
    expect(emailList[0].to.length).toBe(3);
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
      expect.arrayContaining([
        CustomRealms[0].productOwnerEmail,
        CustomRealms[0].technicalContactEmail,
        CustomRealms[0].secondTechnicalContactEmail,
      ]),
    );
    expect(emailList[0].to.length).toBe(3);
    expect(emailList[0].cc).toEqual(expect.arrayContaining([ssoTeamEmail]));
  });
});

describe('realm admin access on contact changes', () => {
  const PO_IDIR_ID = 'po';
  const TC_IDIR_ID = 'tc';
  const NEW_PO_IDIR_ID = 'newpo';

  const appliedRealm = {
    ...CustomRealmProfiles[0],
    id: 1,
    realm: 'realm-1',
    approved: true,
    status: StatusEnum.APPLIED,
    productOwnerIdirUserId: PO_IDIR_ID,
    productOwnerEmail: 'po@mail.com',
    technicalContactIdirUserId: TC_IDIR_ID,
    technicalContactEmail: 'tc@mail.com',
    productOwnerGuid: null,
    technicalContactGuid: null,
    accessSyncFailedAt: null,
  };

  /**
   * The handler reads the realm before writing, and `syncRealmAccess` reads it again afterwards,
   * so the second read has to reflect the write.
   */
  const mockRealmReads = (update: any = {}) => {
    const updatedRealm = { ...appliedRealm, ...update };
    (prisma.roster.findUnique as jest.Mock)
      .mockImplementationOnce(() => Promise.resolve(appliedRealm))
      .mockImplementation(() => Promise.resolve(updatedRealm));
    (prisma.roster.update as jest.Mock).mockImplementation(() => Promise.resolve(updatedRealm));
    return updatedRealm;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (getServerSession as jest.Mock).mockImplementation(() => ({
      expires: new Date(Date.now() + 2 * 86400).toISOString(),
      user: { username: 'test', given_name: 'test', family_name: 'test', client_roles: ['sso-admin'] },
      status: 'authenticated',
    }));
    (fetchIdirUser as jest.Mock).mockImplementation(({ userId }: { userId: string }) =>
      Promise.resolve({ guid: `${userId}-guid`, userId }),
    );
    (addUserAsRealmAdmin as jest.Mock).mockImplementation(() => Promise.resolve());
    (removeUserAsRealmAdmin as jest.Mock).mockImplementation(() => Promise.resolve());
  });

  it('swaps realm admin access when a contact changes', async () => {
    mockRealmReads({ productOwnerIdirUserId: NEW_PO_IDIR_ID, productOwnerGuid: `${PO_IDIR_ID}-guid` });
    const { req, res }: MockHttpRequest = createMocks({
      method: 'PUT',
      query: { id: 1 },
      body: { ...appliedRealm, productOwnerIdirUserId: NEW_PO_IDIR_ID },
    });

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    appliedRealm.environments.forEach((env) => {
      expect(addUserAsRealmAdmin).toHaveBeenCalledWith(`${NEW_PO_IDIR_ID}-guid@azureidir`, [env], appliedRealm.realm);
      expect(addUserAsRealmAdmin).toHaveBeenCalledWith(`${TC_IDIR_ID}-guid@azureidir`, [env], appliedRealm.realm);
      expect(removeUserAsRealmAdmin).toHaveBeenCalledWith([`${PO_IDIR_ID}-guid`], [env], appliedRealm.realm);
    });
  });

  it('backfills the outgoing guid in the same write that sets the new contact', async () => {
    mockRealmReads({ productOwnerIdirUserId: NEW_PO_IDIR_ID, productOwnerGuid: `${PO_IDIR_ID}-guid` });
    const { req, res }: MockHttpRequest = createMocks({
      method: 'PUT',
      query: { id: 1 },
      body: { ...appliedRealm, productOwnerIdirUserId: NEW_PO_IDIR_ID },
    });

    await handler(req, res);

    const profileUpdateArgs = (prisma.roster.update as jest.Mock).mock.calls[0][0];
    expect(profileUpdateArgs.data.productOwnerIdirUserId).toBe(NEW_PO_IDIR_ID);
    expect(profileUpdateArgs.data.productOwnerGuid).toBe(`${PO_IDIR_ID}-guid`);
  });

  it('does not touch keycloak on an email only edit', async () => {
    mockRealmReads({ productOwnerEmail: 'renamed@mail.com' });
    const { req, res }: MockHttpRequest = createMocks({
      method: 'PUT',
      query: { id: 1 },
      body: { ...appliedRealm, productOwnerEmail: 'renamed@mail.com' },
    });

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(addUserAsRealmAdmin).not.toHaveBeenCalled();
    expect(removeUserAsRealmAdmin).not.toHaveBeenCalled();
    expect(fetchIdirUser).not.toHaveBeenCalled();
  });

  it('rejects an incoming contact that cannot be resolved, without writing anything', async () => {
    mockRealmReads();
    (fetchIdirUser as jest.Mock).mockImplementation(() => Promise.resolve(false));
    const { req, res }: MockHttpRequest = createMocks({
      method: 'PUT',
      query: { id: 1 },
      body: { ...appliedRealm, productOwnerIdirUserId: NEW_PO_IDIR_ID },
    });

    await handler(req, res);

    expect(res.statusCode).toBe(400);
    expect(prisma.roster.update).not.toHaveBeenCalled();
    expect(addUserAsRealmAdmin).not.toHaveBeenCalled();
  });

  it('records an event and skips the revoke when the outgoing contact cannot be resolved', async () => {
    mockRealmReads({ productOwnerIdirUserId: NEW_PO_IDIR_ID });
    (fetchIdirUser as jest.Mock).mockImplementation(({ userId }: { userId: string }) =>
      userId === PO_IDIR_ID ? Promise.resolve(false) : Promise.resolve({ guid: `${userId}-guid`, userId }),
    );
    const { req, res }: MockHttpRequest = createMocks({
      method: 'PUT',
      query: { id: 1 },
      body: { ...appliedRealm, productOwnerIdirUserId: NEW_PO_IDIR_ID },
    });

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    const eventCodes = (createEvent as jest.Mock).mock.calls.map(([args]) => args.eventCode);
    expect(eventCodes).toContain(EventEnum.REQUEST_ACCESS_REVOKE_SKIPPED);

    const profileUpdateArgs = (prisma.roster.update as jest.Mock).mock.calls[0][0];
    expect(profileUpdateArgs.data.productOwnerGuid).toBeUndefined();
    appliedRealm.environments.forEach((env) => {
      expect(removeUserAsRealmAdmin).toHaveBeenCalledWith([], [env], appliedRealm.realm);
    });
  });

  it('returns 200 with the sync status and only notifies the SSO team when the sync fails', async () => {
    mockRealmReads({ productOwnerIdirUserId: NEW_PO_IDIR_ID, productOwnerGuid: `${PO_IDIR_ID}-guid` });
    (addUserAsRealmAdmin as jest.Mock).mockImplementation(() => Promise.reject(new Error('keycloak unavailable')));
    const emailList = createMockSendEmail();

    const { req, res }: MockHttpRequest = createMocks({
      method: 'PUT',
      query: { id: 1 },
      body: { ...appliedRealm, productOwnerIdirUserId: NEW_PO_IDIR_ID },
    });

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect((res as any)._getData().accessSyncFailedAt).toBeInstanceOf(Date);

    const syncUpdateArgs = (prisma.roster.update as jest.Mock).mock.calls[1][0];
    expect(syncUpdateArgs.data.accessSyncFailedAt).toBeInstanceOf(Date);
    expect(syncUpdateArgs.data.productOwnerGuid).toBeUndefined();

    const subjects = emailList.map((email) => email.subject);
    expect(subjects).toContainEqual(expect.stringContaining('Realm admin access sync failed'));
    expect(subjects).not.toContainEqual(expect.stringContaining('Realm Admin access granted'));
    expect(subjects).not.toContainEqual(expect.stringContaining('Realm Admin access removed'));
  });

  it('notifies the incoming and departing contacts once the sync converges', async () => {
    const updatedRealm = mockRealmReads({
      productOwnerIdirUserId: NEW_PO_IDIR_ID,
      productOwnerEmail: 'newpo@mail.com',
      productOwnerGuid: `${PO_IDIR_ID}-guid`,
    });
    const emailList = createMockSendEmail();

    const { req, res }: MockHttpRequest = createMocks({
      method: 'PUT',
      query: { id: 1 },
      body: {
        ...appliedRealm,
        productOwnerIdirUserId: NEW_PO_IDIR_ID,
        productOwnerEmail: 'newpo@mail.com',
      },
    });

    await handler(req, res);

    expect(res.statusCode).toBe(200);

    const granted = emailList.find((email) => email.subject.includes('Realm Admin access granted'));
    expect(granted.to).toEqual([updatedRealm.productOwnerEmail]);
    expect(granted.cc).toEqual(expect.arrayContaining([appliedRealm.technicalContactEmail, ssoTeamEmail]));

    const revoked = emailList.find((email) => email.subject.includes('Realm Admin access removed'));
    expect(revoked.to).toEqual([appliedRealm.productOwnerEmail]);
    expect(revoked.cc).toEqual(expect.arrayContaining([appliedRealm.technicalContactEmail, ssoTeamEmail]));
  });
});
