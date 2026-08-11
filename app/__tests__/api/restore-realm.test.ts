import { createMocks } from 'node-mocks-http';
import handler from '../../pages/api/realms/[id]/restore';
import prisma from 'utils/prisma';
import { createEvent } from 'utils/helpers';
import { EventEnum, StatusEnum } from 'validators/create-realm';
import { ssoTeamEmail } from 'utils/mailer';
import { manageCustomRealm } from 'controllers/keycloak';
import { createMockSendEmail, mockAdminSession, mockSession, mockUserSession } from './utils/mocks';
import { MockHttpRequest, buildMembers } from '__tests__/fixtures';
import { reconcileRealmAccess } from 'controllers/user-access';

jest.mock('utils/ches');

jest.mock('../../utils/helpers', () => {
  return {
    ...jest.requireActual('../../utils/helpers'),
    createEvent: jest.fn(),
  };
});

jest.mock('../../controllers/keycloak', () => {
  return {
    createCustomRealm: jest.fn(() => true),
    manageCustomRealm: jest.fn(() => true),
    deleteCustomRealm: jest.fn(() => true),
    syncUserAccess: jest.fn(() => true),
  };
});

const members = buildMembers();

jest.mock('../../controllers/user-access', () => {
  const actual = jest.requireActual('../../controllers/user-access');
  return {
    ...actual,
    getRealmMembers: jest.fn(() => Promise.resolve(members)),
    reconcileRealmAccess: jest.fn(() => Promise.resolve({ provisioned: true, added: [], removed: [], failures: [] })),
  };
});

const ADMIN_FIRST_NAME = 'admin_firstname';
const ADMIN_LAST_NAME = 'admin_firstname';

jest.mock('next-auth/next', () => {
  return {
    __esModule: true,
    getServerSession: jest.fn(() => {
      return mockSession;
    }),
  };
});

jest.mock('../../pages/api/auth/[...nextauth]', () => {
  return {
    __esModule: true,
    authOptions: {},
  };
});

const realm = {
  id: 2,
  realm: 'realm',
  productName: 'name',
  purpose: 'purpose',
  primaryEndUsers: ['livingInBC', 'businessInBC', 'govEmployees', 'details'],
  environments: ['dev', 'test', 'prod'],
  preferredAdminLoginMethod: 'azureidir',
  ministry: 'ministry',
  branch: 'branch',
  division: 'division',
  approved: null,
  status: 'applied',
  archived: true,
};

describe('Restore Realm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.roster.findUnique as jest.Mock).mockImplementation(() => Promise.resolve(realm));
    (prisma.roster.update as jest.Mock).mockImplementation(({ data }) => Promise.resolve({ ...realm, ...data }));
  });

  it('Only allows sso-admins to restore realms', async () => {
    mockUserSession();
    const { req, res }: MockHttpRequest = createMocks({ method: 'POST' });

    await handler(req, res);

    expect(res.statusCode).toBe(403);

    mockAdminSession();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
  });

  it('Only allows archived realms that are applied to be restored', async () => {
    mockAdminSession();

    const validStatuses = [StatusEnum.APPLIED];
    const invalidStatuses = [StatusEnum.APPLYFAILED, StatusEnum.PENDING];

    const { req, res }: MockHttpRequest = createMocks({ method: 'POST' });

    validStatuses.forEach(async (status) => {
      (prisma.roster.findUnique as jest.Mock).mockImplementationOnce(() =>
        Promise.resolve({ ...realm, archived: true, status }),
      );
      await handler(req, res);
      expect(res.statusCode).toBe(200);
    });

    validStatuses.forEach(async (status) => {
      (prisma.roster.findUnique as jest.Mock).mockImplementationOnce(() =>
        // Reject since archived is false for valid status
        Promise.resolve({ ...realm, archived: false, status }),
      );
      await handler(req, res);
      expect(res.statusCode).toBe(400);
    });

    invalidStatuses.forEach(async (status) => {
      (prisma.roster.findUnique as jest.Mock).mockImplementationOnce(() =>
        Promise.resolve({ ...realm, archived: true, status }),
      );
      await handler(req, res);
      expect(res.statusCode).toBe(400);
    });
  });

  it('Logs a success event when successful', async () => {
    mockAdminSession();
    const { req, res }: MockHttpRequest = createMocks({ method: 'POST' });
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(createEvent).toHaveBeenCalledTimes(1);

    const createEventArgs = (createEvent as jest.Mock).mock.calls[0][0];
    expect(createEventArgs.eventCode).toBe(EventEnum.REQUEST_RESTORE_SUCCESS);
  });

  it('Logs a failure event when restore fails', async () => {
    mockAdminSession();
    (manageCustomRealm as jest.Mock).mockImplementationOnce(() => Promise.reject());
    const { req, res }: MockHttpRequest = createMocks({ method: 'POST' });
    await handler(req, res);

    expect(res.statusCode).toBe(422);
    expect(createEvent).toHaveBeenCalledTimes(1);
    let createEventArgs = (createEvent as jest.Mock).mock.calls[0][0];
    expect(createEventArgs.eventCode).toBe(EventEnum.REQUEST_RESTORE_FAILED);

    expect(prisma.roster.update).toHaveBeenCalledTimes(1);
    let updateArgs = (prisma.roster.update as jest.Mock).mock.calls[0][0];
    expect(updateArgs.data.status).toEqual(StatusEnum.APPLYFAILED);
  });

  it("sends an email to the the realm owners and cc's our team", async () => {
    mockAdminSession();
    const { req, res }: MockHttpRequest = createMocks({ method: 'POST' });
    const emailList = createMockSendEmail();

    await handler(req, res);
    expect(manageCustomRealm).toHaveBeenCalledTimes(1);
    expect(emailList).toHaveLength(1);
    expect(emailList[0].subject).toContain(`Notification: Realm ${realm.realm} Restoration Requested`);
    expect(emailList[0].to).toEqual(
      expect.arrayContaining([members[0].user.email, members[1].user.email, members[2].user.email]),
    );
    expect(emailList[0].to).toHaveLength(3);
    expect(emailList[0].cc).toEqual(expect.arrayContaining([ssoTeamEmail]));
  });

  it('Restores access by reconciling stored membership, with no directory lookup', async () => {
    mockAdminSession();
    const { req, res }: MockHttpRequest = createMocks({ method: 'POST' });
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    // The stored guid is the provisioning key, so restore is a plain reconcile of everyone.
    expect(reconcileRealmAccess).toHaveBeenCalledTimes(1);
    expect((reconcileRealmAccess as jest.Mock).mock.calls[0][1]).toBeUndefined();
  });

  it('Does not reconcile access when the realm could not be restored', async () => {
    mockAdminSession();
    (manageCustomRealm as jest.Mock).mockImplementationOnce(() => Promise.reject());
    const { req, res }: MockHttpRequest = createMocks({ method: 'POST' });
    await handler(req, res);

    expect(res.statusCode).toBe(422);
    expect(reconcileRealmAccess).not.toHaveBeenCalled();
  });

  it('Updates the expected realm fields in the database', async () => {
    mockAdminSession();
    const { req, res }: MockHttpRequest = createMocks({ method: 'POST' });
    await handler(req, res);

    expect(prisma.roster.update).toHaveBeenCalledTimes(1);
    const updateArgs = (prisma.roster.update as jest.Mock).mock.calls[0][0];
    expect(updateArgs.data).toEqual({
      lastUpdatedBy: 'test, test',
      archived: false,
      status: StatusEnum.APPLIED,
    });
  });
});
