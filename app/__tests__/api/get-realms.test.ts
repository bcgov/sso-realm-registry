import { createMocks } from 'node-mocks-http';
import handler from '../../pages/api/realms';
import prisma from 'utils/prisma';
import { MockHttpRequest, roster } from '../fixtures';
import { getServerSession } from 'next-auth';
import KeycloakCore from '../../utils/keycloak-core'

const REALM_NAME = 'realm 1'

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
}

const mockKeycloakRealmResponse = (enabled: boolean = true) => jest.spyOn(KeycloakCore.prototype, 'getRealms')
    .mockReturnValue(Promise.resolve([
        { realm: REALM_NAME, enabled }
    ]));

const mockPrismaRoster = (archived: boolean = false, status: string = 'applied') => (prisma.roster.findMany as jest.Mock).mockImplementation(() => {
    return Promise.resolve([
        { ...roster, realm: REALM_NAME, archived, status },
    ]);
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
        expect(responseData[0].outOfSyncDetails.dev).toBe(`Realm ${REALM_NAME} is listed as archived, but still enabled in the dev environment.`);

        // Disabled in keycloak but active in prisma
        mockKeycloakRealmResponse(false);
        mockPrismaRoster(false);
        await handler(req, res);
        // @ts-ignore
        responseData = res._getData();
        expect(responseData[0].outOfSync).toBe(true);
        expect(responseData[0].outOfSyncDetails.dev).toBe(`Realm ${REALM_NAME} is listed as active, but disabled in the dev environment.`);

        // Missing in keycloak but active in prisma
        jest.spyOn(KeycloakCore.prototype, 'getRealms').mockReturnValue(Promise.resolve([]))
        mockPrismaRoster(false);
        await handler(req, res);
        // @ts-ignore
        responseData = res._getData();
        expect(responseData[0].outOfSync).toBe(true);
        expect(responseData[0].outOfSyncDetails.dev).toBe(`Realm ${REALM_NAME} not found in environment dev`);
    });


});

