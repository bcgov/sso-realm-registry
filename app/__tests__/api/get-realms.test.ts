import { createMocks } from 'node-mocks-http';
import handler from '../../pages/api/realms';
import prisma from 'utils/prisma';
import { MockHttpRequest, buildMembers, roster } from '../fixtures';
import { getServerSession } from 'next-auth';
import KeycloakCore from '../../utils/keycloak-core';

const REALM_NAME = 'realm 1';

jest.mock('@keycloak/keycloak-admin-client', () => {
  return jest.fn().mockImplementation(() => ({
    auth: jest.fn(),
  }));
});

jest.mock('next-auth/next', () => {
  return {
    __esModule: true,
    getServerSession: jest.fn(),
  };
});

const mockUserAdminStatus = (isAdmin: boolean) => {
  (getServerSession as jest.Mock).mockReset();
  (getServerSession as jest.Mock).mockImplementation(() => {
    return {
      expires: new Date(Date.now() + 2 * 86400).toISOString(),
      user: {
        client_roles: isAdmin ? 'sso-admin' : '',
      },
      status: 'authenticated',
    };
  });
};

const mockKeycloakRealmResponse = (enabled: boolean = true) =>
  jest.spyOn(KeycloakCore.prototype, 'getRealms').mockReturnValue(Promise.resolve([{ realm: REALM_NAME, enabled }]));

const mockPrismaRoster = (archived: boolean = false, status: string = 'applied', members = buildMembers()) =>
  (prisma.roster.findMany as jest.Mock).mockImplementation(() => {
    return Promise.resolve([{ ...roster, realm: REALM_NAME, archived, status, members }]);
  });

jest.mock('../../pages/api/auth/[...nextauth]', () => {
  return {
    __esModule: true,
    authOptions: {},
  };
});

describe('Real Out Of Sync Details', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrismaRoster(false, 'applied');
  });

  it('Only includes Out of Sync details for admins', async () => {
    // Check data is excluded for normal user
    mockUserAdminStatus(false);
    const { req, res }: MockHttpRequest = createMocks({
      method: 'GET',
    });
    await handler(req, res);
    // @ts-ignore
    let responseData = res._getData();
    expect(responseData[0].outOfSync).toBeUndefined();
    expect(responseData[0].outOfSyncDetails).toBeUndefined();

    mockUserAdminStatus(true);
    mockKeycloakRealmResponse();
    await handler(req, res);
    // @ts-ignore
    responseData = res._getData();
    expect(responseData[0].outOfSync).toBe(false);
  });

  it('Lists out the reason when out of sync', async () => {
    const { req, res }: MockHttpRequest = createMocks({
      method: 'GET',
    });
    mockUserAdminStatus(true);

    // Correctly indicates when in sync
    mockKeycloakRealmResponse(true);
    mockPrismaRoster(false);
    await handler(req, res);
    // @ts-ignore
    let responseData = res._getData();
    expect(responseData[0].outOfSync).toBe(false);
    expect(responseData[0].outOfSyncDetails).toBeUndefined();

    // Enabled in keycloak but archived in prisma
    mockKeycloakRealmResponse(true);
    mockPrismaRoster(true);
    await handler(req, res);
    // @ts-ignore
    responseData = res._getData();
    expect(responseData[0].outOfSync).toBe(true);
    expect(responseData[0].outOfSyncDetails.dev).toBe(
      `Realm ${REALM_NAME} is listed as archived, but still enabled in the dev environment.`,
    );

    // Disabled in keycloak but active in prisma
    mockKeycloakRealmResponse(false);
    mockPrismaRoster(false);
    await handler(req, res);
    // @ts-ignore
    responseData = res._getData();
    expect(responseData[0].outOfSync).toBe(true);
    expect(responseData[0].outOfSyncDetails.dev).toBe(
      `Realm ${REALM_NAME} is listed as active, but disabled in the dev environment.`,
    );

    // Missing in keycloak but active in prisma
    jest.spyOn(KeycloakCore.prototype, 'getRealms').mockReturnValue(Promise.resolve([]));
    mockPrismaRoster(false);
    await handler(req, res);
    // @ts-ignore
    responseData = res._getData();
    expect(responseData[0].outOfSync).toBe(true);
    expect(responseData[0].outOfSyncDetails.dev).toBe(`Realm ${REALM_NAME} not found in environment dev`);
  });
});

describe('Membership reporting', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockKeycloakRealmResponse(true);
  });

  it('Never leaks the guid, which is the provisioning key', async () => {
    mockUserAdminStatus(true);
    mockPrismaRoster();
    const { req, res }: MockHttpRequest = createMocks({ method: 'GET' });
    await handler(req, res);
    // @ts-ignore
    const responseData = res._getData();

    expect(responseData[0].members).toHaveLength(3);
    responseData[0].members.forEach((member: any) => expect(member.guid).toBeUndefined());
    expect(JSON.stringify(responseData)).not.toContain('guid-po');
  });

  it('Flags membership that still has access work pending', async () => {
    mockUserAdminStatus(true);

    // Everything synced: nothing pending.
    mockPrismaRoster();
    const { req, res }: MockHttpRequest = createMocks({ method: 'GET' });
    await handler(req, res);
    // @ts-ignore
    expect(res._getData()[0].needsSync).toBe(false);

    // A live row that has never synced is a pending add.
    const members = buildMembers();
    members[0].syncedAt = null;
    mockPrismaRoster(false, 'applied', members);
    await handler(req, res);
    // @ts-ignore
    expect(res._getData()[0].needsSync).toBe(true);

    // A tombstone that has not been revoked yet is a pending revoke.
    const withTombstone = buildMembers();
    withTombstone[2].removedAt = new Date();
    withTombstone[2].revokedAt = null;
    mockPrismaRoster(false, 'applied', withTombstone);
    await handler(req, res);
    // @ts-ignore
    expect(res._getData()[0].needsSync).toBe(true);
    // Tombstones are not shown to the client.
    // @ts-ignore
    expect(res._getData()[0].members).toHaveLength(2);
  });

  it('Counts members that never resolved in the directory', async () => {
    mockUserAdminStatus(true);

    const members = buildMembers();
    members[2].user.guid = null;
    members[2].user.resolvedAt = null;
    members[2].syncedAt = null;
    mockPrismaRoster(false, 'applied', members);

    const { req, res }: MockHttpRequest = createMocks({ method: 'GET' });
    await handler(req, res);
    // @ts-ignore
    const responseData = res._getData();

    expect(responseData[0].unresolvedMemberCount).toBe(1);
    // They can never be provisioned, so they must not keep the sync button lit forever.
    expect(responseData[0].needsSync).toBe(false);
  });
});
