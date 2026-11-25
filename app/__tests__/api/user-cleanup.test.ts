import { createMocks } from 'node-mocks-http';
import handler from '../../pages/api/users/cleanup';
import prisma from 'utils/prisma';
import { MockHttpRequest } from '../fixtures';
import { MemberRoleEnum } from 'utils/constants';

const API_KEY = 'cleanup-secret';

describe('User cleanup configuration endpoint', () => {
  beforeEach(() => {
    process.env.API_AUTH_SECRET = API_KEY;
    process.env.ENABLE_USER_CLEANUP = 'true';
    jest.clearAllMocks();
  });

  it('Returns approved, active opted-in realms and notification recipients', async () => {
    (prisma.roster.findMany as jest.Mock).mockResolvedValue([
      {
        realm: 'realm-one',
        userCleanupNotifications: true,
        members: [{ user: { email: 'po@gov.bc.ca' } }, { user: { email: 'tl@gov.bc.ca' } }],
      },
      {
        realm: 'realm-two',
        userCleanupNotifications: false,
        members: [],
      },
    ]);
    const { req, res }: MockHttpRequest = createMocks({
      method: 'GET',
      headers: { authorization: API_KEY },
    });

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    // @ts-ignore node-mocks-http extends NextApiResponse with this helper.
    expect(res._getJSONData()).toEqual({
      realms: [
        {
          name: 'realm-one',
          notifyOnDeletion: true,
          notifications: ['po@gov.bc.ca', 'tl@gov.bc.ca'],
        },
        {
          name: 'realm-two',
          notifyOnDeletion: false,
          notifications: [],
        },
      ],
    });
    expect(prisma.roster.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userCleanupEnabled: true,
          approved: true,
          archived: false,
          realm: { not: null },
        },
        select: expect.objectContaining({
          userCleanupNotifications: true,
          members: expect.objectContaining({
            where: {
              removedAt: null,
              role: { in: [MemberRoleEnum.PRODUCT_OWNER, MemberRoleEnum.TECHNICAL_LEAD] },
            },
          }),
        }),
      }),
    );
  });

  it('Rejects requests without the API secret', async () => {
    const { req, res }: MockHttpRequest = createMocks({ method: 'GET' });

    await handler(req, res);

    expect(res.statusCode).toBe(401);
    expect(prisma.roster.findMany).not.toHaveBeenCalled();
  });

  it('Hides the endpoint while cleanup is disabled', async () => {
    process.env.ENABLE_USER_CLEANUP = 'false';
    const { req, res }: MockHttpRequest = createMocks({
      method: 'GET',
      headers: { authorization: API_KEY },
    });

    await handler(req, res);

    expect(res.statusCode).toBe(404);
    expect(prisma.roster.findMany).not.toHaveBeenCalled();
  });
});
