import { createMocks } from 'node-mocks-http';
import handler from '../../pages/api/users/[id]';
import prisma from 'utils/prisma';
import { MockHttpRequest, buildMember, roster } from '../fixtures';
import { createMockSendEmail, mockSession } from './utils/mocks';
import { ssoTeamEmail } from 'utils/mailer';
import { MemberRoleEnum } from 'utils/constants';
import { getRealmMembers, reconcileRealmAccess } from 'controllers/user-access';
import { createEvent } from 'utils/helpers';

jest.mock('utils/ches');

jest.mock('next-auth/next', () => {
  return {
    __esModule: true,
    getServerSession: jest.fn(() => {
      return mockSession;
    }),
  };
});

// The webhook only reads membership; stubbing the admin client keeps its ESM out of jest.
jest.mock('../../controllers/keycloak', () => {
  return {
    syncUserAccess: jest.fn(),
  };
});

jest.mock('../../controllers/user-access', () => {
  const actual = jest.requireActual('../../controllers/user-access');
  return {
    ...actual,
    getRealmMembers: jest.fn(),
    reconcileRealmAccess: jest.fn(() => Promise.resolve({ provisioned: true, added: [], removed: [], failures: [] })),
  };
});

jest.mock('utils/helpers', () => {
  const actual = jest.requireActual('utils/helpers');
  return {
    ...actual,
    createEvent: jest.fn(),
  };
});

const DELETED_USER_ID = 'DEL';
const DELETED_USER_EMAIL = 'DEL@MAIL';

const TC_MAIL = 'TC@MAIL';
const TC_ID = 'TC';
const PO_ID = 'PO';
const PO_MAIL = 'PO@MAIL';
const EXTRA_ID = 'EXTRA';
const EXTRA_MAIL = 'EXTRA@mail';

const member = (role: MemberRoleEnum, idirUsername: string, email: string, rosterId: number) =>
  buildMember(role, { idirUsername, email, guid: `guid-${idirUsername}` }, { rosterId });

/**
 * Each case describes one realm the departed user held membership on. The last case is
 * the one the old three column lookup could never catch: an additional user.
 */
const testCases = [
  { realm: 'realm 1', deletedRoles: [MemberRoleEnum.PRODUCT_OWNER] },
  { realm: 'realm 2', deletedRoles: [MemberRoleEnum.TECHNICAL_LEAD] },
  { realm: 'realm 3', deletedRoles: [MemberRoleEnum.ADDITIONAL] },
  { realm: 'realm 4', deletedRoles: [MemberRoleEnum.TECHNICAL_LEAD, MemberRoleEnum.ADDITIONAL] },
  {
    realm: 'realm 5',
    deletedRoles: [MemberRoleEnum.PRODUCT_OWNER, MemberRoleEnum.TECHNICAL_LEAD, MemberRoleEnum.ADDITIONAL],
  },
];

/** The full membership of a realm: the departed user's rows, plus whoever else survives. */
const membersForRoster = (rosterId: number) => {
  const testCase = testCases[rosterId - 1];
  const deleted = testCase.deletedRoles.map((role) => member(role, DELETED_USER_ID, DELETED_USER_EMAIL, rosterId));
  const remaining = [
    { role: MemberRoleEnum.PRODUCT_OWNER, id: PO_ID, mail: PO_MAIL },
    { role: MemberRoleEnum.TECHNICAL_LEAD, id: TC_ID, mail: TC_MAIL },
    { role: MemberRoleEnum.ADDITIONAL, id: EXTRA_ID, mail: EXTRA_MAIL },
  ]
    .filter(({ role }) => !testCase.deletedRoles.includes(role))
    .map(({ role, id, mail }) => member(role, id, mail, rosterId));

  return [...deleted, ...remaining];
};

const mockMemberships = () =>
  (prisma.user.findFirst as jest.Mock).mockImplementation(() => {
    const rosters = testCases.flatMap((testCase, index) =>
      testCase.deletedRoles.map((role) => ({
        ...member(role, DELETED_USER_ID, DELETED_USER_EMAIL, index + 1),
        roster: { ...roster, id: index + 1, realm: testCase.realm, approved: true, status: 'applied', archived: false },
      })),
    );

    return Promise.resolve({
      id: rosters[0].userId,
      idirUsername: DELETED_USER_ID,
      rosters,
    });
  });

const mockApiKey = 'secret';

describe('IDIR user deletion', () => {
  const { req, res }: MockHttpRequest = createMocks({
    method: 'DELETE',
    headers: { authorization: mockApiKey },
    query: { id: DELETED_USER_ID },
  });

  beforeEach(() => {
    process.env.API_AUTH_SECRET = mockApiKey;
    jest.clearAllMocks();
    mockMemberships();
    (getRealmMembers as jest.Mock).mockImplementation((rosterId: number) =>
      Promise.resolve(membersForRoster(rosterId)),
    );
  });

  it('Emails the other realm owners when a user is deleted', async () => {
    const emailList = createMockSendEmail();
    await handler(req, res);

    testCases.forEach((testCase, i) => {
      const email = emailList[i];
      const poDeleted = testCase.deletedRoles.includes(MemberRoleEnum.PRODUCT_OWNER);
      const tcDeleted = testCase.deletedRoles.includes(MemberRoleEnum.TECHNICAL_LEAD);

      // Should email the PO unless they were deleted
      if (!poDeleted) expect(email.to.includes(PO_MAIL)).toBeTruthy();
      else expect(email.to.includes(PO_MAIL)).not.toBeTruthy();

      // Should email the Tech Lead unless they were deleted
      if (!tcDeleted) expect(email.to.includes(TC_MAIL)).toBeTruthy();
      else expect(email.to.includes(TC_MAIL)).not.toBeTruthy();

      // Additional users are not notified, as they cannot act on the roster
      expect(email.to.includes(EXTRA_MAIL)).not.toBeTruthy();

      // Never write to the departed user
      expect(email.to.includes(DELETED_USER_EMAIL)).not.toBeTruthy();
    });
  });

  it('Emails the sso team when any user is deleted including their realms and roles', async () => {
    const emailList = createMockSendEmail();
    await handler(req, res);

    const teamEmails = emailList.filter((email) => email.to.includes(ssoTeamEmail));
    expect(teamEmails).toHaveLength(1);
    const teamEmail = teamEmails[0];

    // Fetch bullet items to check realms and contact lists
    const listItems = [...teamEmail.body.matchAll(/<li>(.*?)<\/li>/g)].map((m) => m[1]);

    testCases.forEach((testCase, i) => {
      const listItem = listItems[i];

      // List item should include the realm name and the members removed
      expect(listItem.includes(testCase.realm)).toBeTruthy();
      if (testCase.deletedRoles.includes(MemberRoleEnum.PRODUCT_OWNER))
        expect(listItem.includes('Product Owner')).toBeTruthy();
      if (testCase.deletedRoles.includes(MemberRoleEnum.TECHNICAL_LEAD))
        expect(listItem.includes('Technical Lead')).toBeTruthy();
      // Additional users are caught now, which the old three column lookup never could
      if (testCase.deletedRoles.includes(MemberRoleEnum.ADDITIONAL))
        expect(listItem.includes('Additional User')).toBeTruthy();
    });
  });

  it('Tombstones all memberships and reconciles each affected realm', async () => {
    createMockSendEmail();
    await handler(req, res);

    const memberships = (await (prisma.user.findFirst as jest.Mock).mock.results[0].value).rosters;
    expect(prisma.userRoster.updateMany).toHaveBeenCalledWith({
      where: { id: { in: memberships.map((membership: any) => membership.id) }, removedAt: null },
      data: { removedAt: expect.any(Date) },
    });
    expect(reconcileRealmAccess).toHaveBeenCalledTimes(testCases.length);
    testCases.forEach((_, index) => {
      expect(reconcileRealmAccess).toHaveBeenCalledWith(expect.objectContaining({ id: index + 1 }), {
        memberIds: memberships
          .filter((membership: any) => membership.rosterId === index + 1)
          .map((membership: any) => membership.id),
      });
    });
    expect(prisma.user.delete).not.toHaveBeenCalled();
  });

  it('Marks only a realm with no remaining managing lead as requiring action', async () => {
    const emailList = createMockSendEmail();
    await handler(req, res);

    const teamEmail = emailList.find(
      (email) => email.to.includes(ssoTeamEmail) && email.subject.includes('Notification: User Removed'),
    );
    expect(teamEmail.body).toContain(
      'realm 5: Product Owner, Technical Lead, Additional User - <strong>Action required',
    );
    expect(teamEmail.body).not.toContain('realm 1: Product Owner - <strong>Action required');
    expect(teamEmail.body).not.toContain('realm 2: Technical Lead - <strong>Action required');
  });

  it('Returns OK without changing anything when the user is not in the users table', async () => {
    (prisma.user.findFirst as jest.Mock).mockResolvedValue(null);
    createMockSendEmail();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(prisma.userRoster.updateMany).not.toHaveBeenCalled();
    expect(reconcileRealmAccess).not.toHaveBeenCalled();
  });

  it('Returns OK without changing anything when the user has no active memberships', async () => {
    (prisma.user.findFirst as jest.Mock).mockResolvedValue({
      id: 1,
      idirUsername: DELETED_USER_ID,
      rosters: [],
    });
    createMockSendEmail();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(prisma.userRoster.updateMany).not.toHaveBeenCalled();
    expect(reconcileRealmAccess).not.toHaveBeenCalled();
  });

  it('Returns OK and notifies SSO when a Keycloak revocation remains pending', async () => {
    (reconcileRealmAccess as jest.Mock).mockResolvedValueOnce({
      provisioned: true,
      added: [],
      removed: [],
      failures: [{ idirUsername: DELETED_USER_ID, env: 'prod', action: 'remove', error: 'ECONNREFUSED' }],
    });
    const emailList = createMockSendEmail();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(emailList.some((email) => email.subject.includes('Realm access sync failed: realm 1'))).toBeTruthy();
  });

  it('Records an audit event for each affected realm', async () => {
    createMockSendEmail();
    await handler(req, res);

    expect(createEvent).toHaveBeenCalledTimes(testCases.length);
    expect(createEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        realmId: 1,
        idirUserId: DELETED_USER_ID,
        details: expect.objectContaining({
          automated: true,
          reason: 'inactive-idir',
        }),
      }),
    );
  });
});
