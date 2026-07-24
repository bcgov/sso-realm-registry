import { createMocks } from 'node-mocks-http';
import handler from '../../pages/api/realms/[id]/sync-access';
import prisma from 'utils/prisma';
import { addUserAsRealmAdmin, ensureMasterRealmAdminGroup, removeUserAsRealmAdmin } from 'controllers/keycloak';
import { fetchIdirUser } from 'controllers/msal';
import { createEvent } from 'utils/helpers';
import { EventEnum, StatusEnum } from 'validators/create-realm';
import { ssoTeamEmail } from 'utils/mailer';
import { createMockSendEmail, mockAdminSession, mockSession, mockUserSession } from './utils/mocks';
import { CustomRealmProfiles, MockHttpRequest } from '../fixtures';

jest.mock('utils/ches');

jest.mock('../../utils/helpers', () => {
  return {
    ...jest.requireActual('../../utils/helpers'),
    createEvent: jest.fn(),
  };
});

jest.mock('../../controllers/keycloak', () => {
  return {
    buildMasterUsername: (guid: string) => `${guid.toLowerCase()}@azureidir`,
    ensureMasterRealmAdminGroup: jest.fn(),
    addUserAsRealmAdmin: jest.fn(),
    removeUserAsRealmAdmin: jest.fn(),
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
    getServerSession: jest.fn(() => mockSession),
  };
});

jest.mock('../../pages/api/auth/[...nextauth]', () => {
  return {
    __esModule: true,
    authOptions: {},
  };
});

const PO_IDIR_ID = 'po';
const TC_IDIR_ID = 'tc';

const realm = {
  ...CustomRealmProfiles[0],
  id: 1,
  realm: 'realm-1',
  environments: ['dev', 'test', 'prod'],
  approved: true,
  status: StatusEnum.APPLIED,
  productOwnerIdirUserId: PO_IDIR_ID,
  productOwnerEmail: 'po@mail.com',
  technicalContactIdirUserId: TC_IDIR_ID,
  technicalContactEmail: 'tc@mail.com',
  productOwnerGuid: null as string | null,
  technicalContactGuid: null as string | null,
  accessSyncFailedAt: new Date(),
};

const guidOf = (idirUserId: string) => `${idirUserId}-guid`;
const usernameOf = (idirUserId: string) => `${guidOf(idirUserId)}@azureidir`;

const mockRealm = (overrides: Partial<typeof realm> = {}) => {
  const merged = { ...realm, ...overrides };
  (prisma.roster.findUnique as jest.Mock).mockImplementation(() => Promise.resolve(merged));
  return merged;
};

const post = async () => {
  const { req, res }: MockHttpRequest = createMocks({ method: 'POST', query: { id: 1 } });
  await handler(req, res);
  return res;
};

describe('Sync realm access', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAdminSession();
    mockRealm();
    (prisma.roster.update as jest.Mock).mockImplementation(() => Promise.resolve({}));
    (fetchIdirUser as jest.Mock).mockImplementation(({ userId }: { userId: string }) =>
      Promise.resolve({ guid: guidOf(userId), userId }),
    );
    (ensureMasterRealmAdminGroup as jest.Mock).mockImplementation(() => Promise.resolve({ id: 'group-id' }));
    (addUserAsRealmAdmin as jest.Mock).mockImplementation(() => Promise.resolve());
    (removeUserAsRealmAdmin as jest.Mock).mockImplementation(() => Promise.resolve());
  });

  it('Only allows sso-admins to sync realm access', async () => {
    (require('next-auth').getServerSession as jest.Mock).mockImplementation(() => null);
    expect((await post()).statusCode).toBe(401);

    mockUserSession();
    expect((await post()).statusCode).toBe(403);
    expect(addUserAsRealmAdmin).not.toHaveBeenCalled();

    mockAdminSession();
    expect((await post()).statusCode).toBe(200);
  });

  it('Rejects methods other than POST', async () => {
    const { req, res }: MockHttpRequest = createMocks({ method: 'GET', query: { id: 1 } });
    await handler(req, res);
    expect(res.statusCode).toBe(405);
  });

  it('Grants the current contacts and revokes the previous one in every environment', async () => {
    mockRealm({ productOwnerGuid: 'former-po-guid', technicalContactGuid: guidOf(TC_IDIR_ID) });

    const res = await post();

    expect(res.statusCode).toBe(200);
    realm.environments.forEach((env) => {
      expect(addUserAsRealmAdmin).toHaveBeenCalledWith(usernameOf(PO_IDIR_ID), [env], realm.realm);
      expect(addUserAsRealmAdmin).toHaveBeenCalledWith(usernameOf(TC_IDIR_ID), [env], realm.realm);
      expect(removeUserAsRealmAdmin).toHaveBeenCalledWith(['former-po-guid'], [env], realm.realm);
    });
    expect(addUserAsRealmAdmin).toHaveBeenCalledTimes(realm.environments.length * 2);
  });

  it('Never revokes an identity that still holds the other managed slot', async () => {
    // The product owner slot is handed to a new person, but the previous owner is the tech lead
    mockRealm({
      productOwnerIdirUserId: 'newpo',
      productOwnerGuid: guidOf(TC_IDIR_ID),
      technicalContactGuid: guidOf(TC_IDIR_ID),
    });

    const res = await post();

    expect(res.statusCode).toBe(200);
    realm.environments.forEach((env) => {
      expect(removeUserAsRealmAdmin).toHaveBeenCalledWith([], [env], realm.realm);
    });
    expect(addUserAsRealmAdmin).toHaveBeenCalledWith(usernameOf(TC_IDIR_ID), ['dev'], realm.realm);
  });

  it('Grants a shared identity once when both contacts are the same person', async () => {
    mockRealm({ technicalContactIdirUserId: PO_IDIR_ID });

    await post();

    expect(addUserAsRealmAdmin).toHaveBeenCalledTimes(realm.environments.length);
    expect(addUserAsRealmAdmin).toHaveBeenCalledWith(usernameOf(PO_IDIR_ID), ['dev'], realm.realm);
  });

  it('Advances the guid columns and clears the failure flag on full convergence', async () => {
    const res = await post();

    expect((res as any)._getJSONData().success).toBe(true);
    expect(prisma.roster.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: {
        productOwnerGuid: guidOf(PO_IDIR_ID),
        technicalContactGuid: guidOf(TC_IDIR_ID),
        accessSyncFailedAt: null,
      },
    });

    const eventArgs = (createEvent as jest.Mock).mock.calls[0][0];
    expect(eventArgs.eventCode).toBe(EventEnum.REQUEST_ACCESS_SYNC_SUCCESS);
  });

  it('Leaves the guid columns untouched and flags the realm when one environment fails', async () => {
    mockRealm({ productOwnerGuid: 'former-po-guid' });
    (addUserAsRealmAdmin as jest.Mock).mockImplementation((_username: string, [env]: string[]) =>
      env === 'test' ? Promise.reject(new Error('keycloak unavailable')) : Promise.resolve(),
    );
    const emailList = createMockSendEmail();

    const res = await post();

    const body = (res as any)._getJSONData();
    expect(body.success).toBe(false);
    expect(body.errors).toEqual([{ env: 'test', error: 'keycloak unavailable' }]);

    const updateArgs = (prisma.roster.update as jest.Mock).mock.calls[0][0];
    expect(updateArgs.data.accessSyncFailedAt).toBeTruthy();
    expect(updateArgs.data.productOwnerGuid).toBeUndefined();
    expect(updateArgs.data.technicalContactGuid).toBeUndefined();

    // The failing environment aborts before its revoke, so a realm never loses its last admin
    expect(removeUserAsRealmAdmin).not.toHaveBeenCalledWith(expect.anything(), ['test'], realm.realm);

    const eventArgs = (createEvent as jest.Mock).mock.calls[0][0];
    expect(eventArgs.eventCode).toBe(EventEnum.REQUEST_ACCESS_SYNC_FAILED);
    expect(emailList.map((email) => email.to)).toEqual([[ssoTeamEmail]]);
  });

  it('Fails without writing guids when a contact has no Entra account', async () => {
    (fetchIdirUser as jest.Mock).mockImplementation(({ userId }: { userId: string }) =>
      userId === PO_IDIR_ID ? Promise.resolve(false) : Promise.resolve({ guid: guidOf(userId), userId }),
    );

    const res = await post();

    const body = (res as any)._getJSONData();
    expect(body.success).toBe(false);
    expect(body.unresolved).toEqual([{ field: 'productOwnerIdirUserId', idirUserId: PO_IDIR_ID }]);

    const updateArgs = (prisma.roster.update as jest.Mock).mock.calls[0][0];
    expect(updateArgs.data.technicalContactGuid).toBeUndefined();
  });

  it('Is a no-op in effective access when re-run on a converged realm', async () => {
    mockRealm({ productOwnerGuid: guidOf(PO_IDIR_ID), technicalContactGuid: guidOf(TC_IDIR_ID) });

    await post();
    const firstRunGrants = (addUserAsRealmAdmin as jest.Mock).mock.calls;
    expect(firstRunGrants).toHaveLength(realm.environments.length * 2);
    realm.environments.forEach((env) => {
      expect(removeUserAsRealmAdmin).toHaveBeenCalledWith([], [env], realm.realm);
    });

    const firstUpdate = (prisma.roster.update as jest.Mock).mock.calls[0][0];

    await post();

    // The same guids are written back, so repeat invocations converge on the same state
    const secondUpdate = (prisma.roster.update as jest.Mock).mock.calls[1][0];
    expect(secondUpdate).toEqual(firstUpdate);
  });

  it('Returns 404 for an unknown realm', async () => {
    (prisma.roster.findUnique as jest.Mock).mockImplementation(() => Promise.resolve(null));
    expect((await post()).statusCode).toBe(404);
  });
});
