import { createMocks } from 'node-mocks-http';
import handler from '../../pages/api/realms/[id]';
import prisma from 'utils/prisma';
import { CustomRealmProfiles, CustomRealms, MockHttpRequest, buildMembers } from '../fixtures';
import { getServerSession } from 'next-auth';
import { manageCustomRealm } from 'controllers/keycloak';
import { createEvent } from 'utils/helpers';
import { EventEnum } from 'validators/create-realm';
import { createMockSendEmail } from './utils/mocks';
import { ssoTeamEmail } from 'utils/mailer';
import {
  MemberRoleEnum,
  applyMembershipChanges,
  getUserRoleOnRealm,
  reconcileRealmAccess,
  resolveMembership,
} from 'controllers/user-access';
import { MemberRoleEnum as MemberRole } from 'utils/constants';

jest.mock('../../utils/helpers', () => {
  return {
    ...jest.requireActual('../../utils/helpers'),
    createEvent: jest.fn(),
  };
});

jest.mock('utils/ches');

jest.mock('../../controllers/keycloak.ts', () => {
  return {
    createCustomRealm: jest.fn(() => true),
    manageCustomRealm: jest.fn(() => true),
    syncUserAccess: jest.fn(() => true),
  };
});

const members = buildMembers();

jest.mock('../../controllers/user-access', () => {
  const actual = jest.requireActual('../../controllers/user-access');
  return {
    ...actual,
    getUserRoleOnRealm: jest.fn(),
    resolveMembership: jest.fn(() => Promise.resolve([])),
    applyMembershipChanges: jest.fn(() => Promise.resolve({ changedIds: [], addedIds: [], removedIds: [] })),
    reconcileRealmAccess: jest.fn(() => Promise.resolve({ provisioned: true, added: [], removed: [], failures: [] })),
    getRealmMembers: jest.fn(() => Promise.resolve(members)),
    revokeAllRealmAccess: jest.fn(() => Promise.resolve([])),
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

/** Membership never reaches the roster update; it is applied through `users_rosters`. */
const commonAllowedFields = ['ministry', 'division', 'branch'];
// Product owner and technical lead are symmetric: both may edit the full form,
// restricted only from the admin-only fields.
const editableAllowedFields = [...commonAllowedFields, 'purpose', 'productName', 'primaryEndUsers'];
const adminAllowedFields = [...editableAllowedFields, 'materialToSend', 'approved'];

const editableRestrictedFields = ['materialToSend', 'approved'];

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

const mockAdmin = () => {
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
};

/** A request body carrying every field the widest schema accepts. */
const requestBody = (overrides: any = {}) => ({
  ...CustomRealmProfiles[0],
  productOwner: { azureId: 'azure-po' },
  technicalLead: { azureId: 'azure-tl' },
  additionalUsers: [{ azureId: 'azure-extra' }],
  ...overrides,
});

describe('Profile Validations', () => {
  const testRoster = { ...CustomRealmProfiles[0], status: 'applied', approved: true };

  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.roster.findUnique as jest.Mock).mockImplementation(() => Promise.resolve(testRoster));
    (prisma.roster.update as jest.Mock).mockImplementation(() => Promise.resolve(testRoster));
    (getUserRoleOnRealm as jest.Mock).mockImplementation(() => Promise.resolve(null));
    (resolveMembership as jest.Mock).mockImplementation(() => Promise.resolve([]));
    (applyMembershipChanges as jest.Mock).mockImplementation(() =>
      Promise.resolve({ changedIds: [], addedIds: [], removedIds: [] }),
    );
  });

  it('Returns 401 when the user holds no membership on the realm', async () => {
    mockUserSession('some_user');
    const { req, res }: MockHttpRequest = createMocks({ method: 'PUT', body: requestBody(), query: { id: 1 } });
    await handler(req, res);
    expect(res.statusCode).toBe(401);
  });

  it('Returns 401 for an additional user, who is view only', async () => {
    mockUserSession('extra');
    (getUserRoleOnRealm as jest.Mock).mockImplementation(() => Promise.resolve(MemberRole.ADDITIONAL));
    const { req, res }: MockHttpRequest = createMocks({ method: 'PUT', body: requestBody(), query: { id: 1 } });
    await handler(req, res);
    expect(res.statusCode).toBe(401);
    expect(prisma.roster.update).not.toHaveBeenCalled();
  });

  it('Allows the technical lead to update the full form, same as the product owner', async () => {
    mockUserSession('tl');
    (getUserRoleOnRealm as jest.Mock).mockImplementation(() => Promise.resolve(MemberRole.TECHNICAL_LEAD));
    const { req, res }: MockHttpRequest = createMocks({ method: 'PUT', body: requestBody(), query: { id: 1 } });
    await handler(req, res);

    const updatedFields = Object.keys((prisma.roster.update as jest.Mock).mock.calls[0][0].data);
    editableAllowedFields.forEach((field) => expect(updatedFields.includes(field)).toBeTruthy());
    editableRestrictedFields.forEach((field) => expect(updatedFields.includes(field)).toBeFalsy());
  });

  it('Allows the product owner to update the full form, same as the technical lead', async () => {
    mockUserSession('po');
    (getUserRoleOnRealm as jest.Mock).mockImplementation(() => Promise.resolve(MemberRole.PRODUCT_OWNER));
    const { req, res }: MockHttpRequest = createMocks({ method: 'PUT', body: requestBody(), query: { id: 1 } });
    await handler(req, res);

    const updatedFields = Object.keys((prisma.roster.update as jest.Mock).mock.calls[0][0].data);
    editableAllowedFields.forEach((field) => expect(updatedFields.includes(field)).toBeTruthy());
    editableRestrictedFields.forEach((field) => expect(updatedFields.includes(field)).toBeFalsy());
  });

  it('Allows admins to update expected fields', async () => {
    mockAdmin();
    (prisma.roster.findUnique as jest.Mock).mockImplementation(() =>
      Promise.resolve({ ...testRoster, status: 'pending', approved: null }),
    );
    const { req, res }: MockHttpRequest = createMocks({
      method: 'PUT',
      body: requestBody({ approved: 'true', materialToSend: 'notes' }),
      query: { id: 1 },
    });
    await handler(req, res);

    const updatedFields = Object.keys((prisma.roster.update as jest.Mock).mock.calls[0][0].data);
    adminAllowedFields.forEach((field) => expect(updatedFields.includes(field)).toBeTruthy());
  });

  it('Lets both the product owner and the technical lead change membership', async () => {
    for (const role of [MemberRole.PRODUCT_OWNER, MemberRole.TECHNICAL_LEAD]) {
      jest.clearAllMocks();
      (prisma.roster.findUnique as jest.Mock).mockImplementation(() => Promise.resolve(testRoster));
      (prisma.roster.update as jest.Mock).mockImplementation(() => Promise.resolve(testRoster));
      (getUserRoleOnRealm as jest.Mock).mockImplementation(() => Promise.resolve(role));
      mockUserSession('someone');

      const { req, res }: MockHttpRequest = createMocks({ method: 'PUT', body: requestBody(), query: { id: 1 } });
      await handler(req, res);

      expect(res.statusCode).toBe(200);
      expect(applyMembershipChanges).toHaveBeenCalledTimes(1);
    }
  });

  it('Rejects a membership payload the server cannot resolve', async () => {
    mockUserSession('po');
    (getUserRoleOnRealm as jest.Mock).mockImplementation(() => Promise.resolve(MemberRole.PRODUCT_OWNER));
    const { MemberValidationError } = jest.requireActual('../../controllers/user-access');
    (resolveMembership as jest.Mock).mockImplementation(() => {
      throw new MemberValidationError('Product owner has no IDIR guid in the directory');
    });

    const { req, res }: MockHttpRequest = createMocks({ method: 'PUT', body: requestBody(), query: { id: 1 } });
    await handler(req, res);

    expect(res.statusCode).toBe(400);
    expect(prisma.roster.update).not.toHaveBeenCalled();
  });

  it('does not allow to update rejected realms', async () => {
    mockUserSession('po');
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

  it('Reconciles only the members that changed on an ordinary save', async () => {
    mockUserSession('po');
    (getUserRoleOnRealm as jest.Mock).mockImplementation(() => Promise.resolve(MemberRole.PRODUCT_OWNER));
    (applyMembershipChanges as jest.Mock).mockImplementation(() =>
      Promise.resolve({ changedIds: [7, 8], addedIds: [8], removedIds: [7] }),
    );

    const { req, res }: MockHttpRequest = createMocks({ method: 'PUT', body: requestBody(), query: { id: 1 } });
    await handler(req, res);

    expect(reconcileRealmAccess).toHaveBeenCalledWith(expect.anything(), { memberIds: [7, 8] });
  });

  it('Emails the SSO team a single summary when a sync fails', async () => {
    mockUserSession('po');
    (getUserRoleOnRealm as jest.Mock).mockImplementation(() => Promise.resolve(MemberRole.PRODUCT_OWNER));
    (reconcileRealmAccess as jest.Mock).mockImplementation(() =>
      Promise.resolve({
        provisioned: true,
        added: [],
        removed: [],
        failures: [
          { idirUsername: 'asmith', env: 'prod', action: 'add', error: 'ECONNREFUSED' },
          { idirUsername: 'bjones', env: 'prod', action: 'remove', error: 'ECONNREFUSED' },
        ],
      }),
    );

    const emailList = createMockSendEmail();
    const { req, res }: MockHttpRequest = createMocks({ method: 'PUT', body: requestBody(), query: { id: 1 } });
    await handler(req, res);

    const failureEmails = emailList.filter((email) => email.subject.includes('Realm access sync failed'));
    expect(failureEmails.length).toBe(1);
    expect(failureEmails[0].to).toEqual([ssoTeamEmail]);
    expect(failureEmails[0].body).toContain('asmith');
    expect(failureEmails[0].body).toContain('bjones');
    expect(failureEmails[0].body).toContain('dev and test succeeded');
  });

  it('Only confirms access changes that fully succeeded', async () => {
    mockUserSession('po');
    (getUserRoleOnRealm as jest.Mock).mockImplementation(() => Promise.resolve(MemberRole.PRODUCT_OWNER));
    (reconcileRealmAccess as jest.Mock).mockImplementation(() =>
      Promise.resolve({
        provisioned: true,
        added: [members[2]],
        removed: [],
        failures: [],
      }),
    );

    const emailList = createMockSendEmail();
    const { req, res }: MockHttpRequest = createMocks({ method: 'PUT', body: requestBody(), query: { id: 1 } });
    await handler(req, res);

    const onboarding = emailList.filter((email) => email.subject.includes('has been granted realm admin access'));
    expect(onboarding.length).toBe(1);
    // The affected user, plus the product owner and technical lead.
    expect(onboarding[0].to).toEqual(
      expect.arrayContaining([members[2].user.email, members[0].user.email, members[1].user.email]),
    );
    // No instructions to grant access by hand; the application already did it.
    expect(onboarding[0].body).not.toContain('Action required');
  });
});

describe('approval and rejection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getUserRoleOnRealm as jest.Mock).mockImplementation(() => Promise.resolve(null));
    (resolveMembership as jest.Mock).mockImplementation(() => Promise.resolve([]));
    (applyMembershipChanges as jest.Mock).mockImplementation(() =>
      Promise.resolve({ changedIds: [], addedIds: [], removedIds: [] }),
    );
    (reconcileRealmAccess as jest.Mock).mockImplementation(() =>
      Promise.resolve({ provisioned: true, added: [], removed: [], failures: [] }),
    );
  });

  it('calls kc admin api to create realm in all environments after approval', async () => {
    (prisma.roster.findUnique as jest.Mock).mockImplementation(() => {
      return Promise.resolve(CustomRealmProfiles[0]);
    });

    (prisma.roster.update as jest.Mock).mockImplementation(() => {
      return Promise.resolve({ ...CustomRealms[0], approved: true });
    });
    mockAdmin();
    const { req, res }: MockHttpRequest = createMocks({
      method: 'PUT',
      body: requestBody({ approved: true }),
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

    // Approval reconciles every member, not just the ones that changed.
    expect(reconcileRealmAccess).toHaveBeenCalledWith(expect.anything(), {});

    expect(emailList.length).toBe(2);
    expect(emailList[0].to).toEqual(
      expect.arrayContaining([members[0].user.email, members[1].user.email, members[2].user.email]),
    );
    expect(emailList[0].cc).toEqual(expect.arrayContaining([ssoTeamEmail]));
    expect(emailList[1].cc).toEqual(expect.arrayContaining([ssoTeamEmail]));
    expect(emailList[0].subject).toBe(
      'Important: Your request for Custom Realm realm 1 has been Approved (email 1 of 2)',
    );
    expect(emailList[1].subject).toBe('[DEV] Important: Custom Realm realm 1 Created');
  });

  it('does not call kc admin api to create realm in all environments after rejection', async () => {
    (prisma.roster.findUnique as jest.Mock).mockImplementation(() => {
      return Promise.resolve(CustomRealmProfiles[0]);
    });

    (prisma.roster.update as jest.Mock).mockImplementation(() => {
      return Promise.resolve({ ...CustomRealms[0], approved: false });
    });
    mockAdmin();
    const { req, res }: MockHttpRequest = createMocks({
      method: 'PUT',
      body: requestBody({ approved: false }),
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
      expect.arrayContaining([members[0].user.email, members[1].user.email, members[2].user.email]),
    );
    expect(emailList[0].cc).toEqual(expect.arrayContaining([ssoTeamEmail]));
  });
});
