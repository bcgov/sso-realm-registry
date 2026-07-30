import { createMocks } from 'node-mocks-http';
import deleteHandler from '../../pages/api/realms/[id]';
import prisma from 'utils/prisma';
import { CustomRealmProfiles, MockHttpRequest, buildMembers } from '../fixtures';
import { manageCustomRealm } from 'controllers/keycloak';
import { ssoTeamEmail } from 'utils/mailer';
import { createMockSendEmail, mockAdminSession, mockSession } from './utils/mocks';
import { createEvent } from 'utils/helpers';
import { EventEnum } from 'validators/create-realm';
import { revokeAllRealmAccess } from 'controllers/user-access';

jest.mock('../../utils/helpers', () => {
  return {
    ...jest.requireActual('../../utils/helpers'),
    createEvent: jest.fn(),
  };
});

jest.mock('utils/ches');

jest.mock('../../controllers/keycloak', () => {
  return {
    createCustomRealm: jest.fn(() => true),
    deleteCustomRealm: jest.fn(() => true),
    manageCustomRealm: jest.fn(() => true),
    syncUserAccess: jest.fn(() => true),
  };
});

const members = buildMembers();

jest.mock('../../controllers/user-access', () => {
  const actual = jest.requireActual('../../controllers/user-access');
  return {
    ...actual,
    getUserRoleOnRealm: jest.fn(() => Promise.resolve(null)),
    getRealmMembers: jest.fn(() => Promise.resolve(members)),
    revokeAllRealmAccess: jest.fn(() => Promise.resolve([])),
  };
});

jest.mock('next-auth/next', () => {
  return {
    __esModule: true,
    getServerSession: jest.fn(() => mockSession),
  };
});

jest.mock('../../pages/api/auth/[...nextauth]', () => {
  return {
    __esModule: true,
    authOptions: {},
  };
});

describe('Delete Realm Permissions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Mock prisma find/update functions
    (prisma.roster.findUnique as jest.Mock).mockImplementation(() => {
      return Promise.resolve({ ...CustomRealmProfiles[0], id: 1 });
    });
    (prisma.roster.update as jest.Mock).mockImplementation(() => {
      return Promise.resolve({});
    });
    (prisma.event.create as jest.Mock).mockImplementation(() => {
      return Promise.resolve({});
    });
  });

  it('Only allows admins to delete realms', async () => {
    const { req, res }: MockHttpRequest = createMocks({
      method: 'DELETE',
      query: { id: 1 },
    });
    await deleteHandler(req, res);
    expect(res.statusCode).toBe(401);
    mockAdminSession();
    await deleteHandler(req, res);
    expect(res.statusCode).toBe(200);
    expect(manageCustomRealm).toHaveBeenCalledTimes(1);
    let rosterUpdateArgs = (prisma.roster.update as jest.Mock).mock.calls[0][0];
    expect(rosterUpdateArgs.data.archived).toBe(true);
    expect(rosterUpdateArgs.data.status).toBe('applied');
  });
});

describe('Delete Realms', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.roster.findUnique as jest.Mock).mockImplementation(() => {
      return Promise.resolve({ ...CustomRealmProfiles[0], id: 1, archived: true });
    });
  });

  it('successfully deletes realm in all environments and sends email', async () => {
    mockAdminSession();
    const { req, res }: MockHttpRequest = createMocks({
      method: 'DELETE',
      query: { id: 1 },
    });

    const emailList = createMockSendEmail();

    await deleteHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(manageCustomRealm).toHaveBeenCalledTimes(1);

    // Every member loses realm admin access, in every environment.
    expect(revokeAllRealmAccess).toHaveBeenCalledTimes(1);

    expect(emailList.length).toBe(1);
    expect(emailList[0].subject).toContain(
      `Notification: Custom Realm ${CustomRealmProfiles[0].realm} has now been Deleted.`,
    );
    expect(emailList[0].to).toEqual(
      expect.arrayContaining([members[0].user.email, members[1].user.email, members[2].user.email]),
    );
    expect(emailList[0].to.length).toBe(3);
    expect(emailList[0].cc).toEqual(expect.arrayContaining([ssoTeamEmail]));
  });

  it('does not send email if deleting realm in all environments fails', async () => {
    mockAdminSession();

    (manageCustomRealm as jest.Mock).mockImplementationOnce(() => Promise.reject('some error'));

    const { req, res }: MockHttpRequest = createMocks({
      method: 'DELETE',
      query: { id: 1 },
    });

    const emailList = createMockSendEmail();

    await deleteHandler(req, res);
    const createEventArgs = (createEvent as jest.Mock).mock.calls[0][0];
    expect(createEventArgs.eventCode).toBe(EventEnum.REQUEST_DELETE_FAILED);
    expect(res.statusCode).toBe(422);
    expect(manageCustomRealm).toHaveBeenCalledTimes(1);
    expect(revokeAllRealmAccess).not.toHaveBeenCalled();
    expect(emailList.length).toBe(0);
  });
});
