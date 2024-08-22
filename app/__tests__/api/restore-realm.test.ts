import { createMocks } from 'node-mocks-http';
import handler from '../../pages/api/realms/[id]/restore';
import prisma from 'utils/prisma';
import { getServerSession } from 'next-auth';
import { createEvent } from 'utils/helpers';
import { EventEnum, StatusEnum } from 'validators/create-realm';
import { createCustomRealmPullRequest, mergePullRequest } from 'utils/github';
import { sendEmail } from 'utils/ches';
import { ssoTeamEmail } from 'utils/mailer';

jest.mock('../../utils/ches', () => {
  return {
    sendEmail: jest.fn(),
  };
});

jest.mock('../../utils/helpers', () => {
  return {
    ...jest.requireActual('../../utils/helpers'),
    createEvent: jest.fn(),
  };
});

const PR_NUMBER = 1;
jest.mock('../../utils/github', () => {
  return {
    createCustomRealmPullRequest: jest.fn(() =>
      Promise.resolve({
        data: {
          number: PR_NUMBER,
        },
      }),
    ),
    mergePullRequest: jest.fn(),
  };
});

const ADMIN_FIRST_NAME = 'admin_firstname';
const ADMIN_LAST_NAME = 'admin_firstname';
const adminSession = {
  expires: new Date(Date.now() + 2 * 86400).toISOString(),
  user: {
    family_name: ADMIN_LAST_NAME,
    given_name: ADMIN_FIRST_NAME,
    idir_username: 'admin',
    client_roles: ['sso-admin'],
  },
  status: 'authenticated',
};

const userSession = {
  expires: new Date(Date.now() + 2 * 86400).toISOString(),
  user: {
    idir_username: 'user',
  },
  status: 'authenticated',
};

jest.mock('next-auth/next', () => {
  return {
    __esModule: true,
    getServerSession: jest.fn(() => {
      return adminSession;
    }),
  };
});

jest.mock('../../pages/api/auth/[...nextauth]', () => {
  return {
    __esModule: true,
    authOptions: {},
  };
});

const PO_EMAIL = 'po@mail.com';
const TECHNICAL_CONTACT_EMAIL = 'tc@mail.com';
const realm = {
  id: 2,
  realm: 'realm',
  productName: 'name',
  purpose: 'purpose',
  primaryEndUsers: ['livingInBC', 'businessInBC', 'govEmployees', 'details'],
  environments: ['dev', 'test', 'prod'],
  preferredAdminLoginMethod: 'idir',
  productOwnerEmail: PO_EMAIL,
  productOwnerIdirUserId: 'po',
  technicalContactEmail: TECHNICAL_CONTACT_EMAIL,
  technicalContactIdirUserId: 'd@e.com',
  secondTechnicalContactIdirUserId: 'dmsd',
  secondTechnicalContactEmail: 'a@b.com',
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
    (prisma.roster.update as jest.Mock).mockImplementation(jest.fn());
  });

  it('Only allows sso-admins to restore realms', async () => {
    (getServerSession as jest.Mock).mockImplementation(() => userSession);
    let mocks = createMocks({ method: 'POST' });

    await handler(mocks.req, mocks.res);
    expect(mocks.res.statusCode).toBe(403);

    (getServerSession as jest.Mock).mockImplementation(() => adminSession);
    mocks = createMocks({ method: 'POST' });

    await handler(mocks.req, mocks.res);
    expect(mocks.res.statusCode).toBe(200);
  });

  it('Only allows archived realms that are applied or in pull request to be restored', async () => {
    const { req, res } = createMocks({ method: 'POST' });

    const validStatuses = [StatusEnum.PRSUCCESS, StatusEnum.APPLIED];
    const invalidStatuses = [StatusEnum.APPLYFAILED, StatusEnum.PENDING, StatusEnum.PRFAILED];

    validStatuses.forEach(async (status) => {
      (prisma.roster.findUnique as jest.Mock).mockImplementationOnce(() =>
        Promise.resolve({ ...realm, archived: true, status }),
      );
      await handler(req, res);
      expect(res.statusCode).toBe(200);
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
    const { req, res } = createMocks({ method: 'POST' });
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(createEvent).toHaveBeenCalledTimes(1);

    const createEventArgs = (createEvent as jest.Mock).mock.calls[0][0];
    expect(createEventArgs.eventCode).toBe(EventEnum.REQUEST_RESTORE_SUCCESS);
  });

  it('Logs a failure event when github callouts fail and sets the failed status', async () => {
    (createCustomRealmPullRequest as jest.Mock).mockImplementationOnce(() => Promise.reject());
    const { req, res } = createMocks({ method: 'POST' });
    await handler(req, res);

    expect(res.statusCode).toBe(500);
    expect(createEvent).toHaveBeenCalledTimes(1);
    let createEventArgs = (createEvent as jest.Mock).mock.calls[0][0];
    expect(createEventArgs.eventCode).toBe(EventEnum.REQUEST_RESTORE_FAILED);

    expect(prisma.roster.update).toHaveBeenCalledTimes(1);
    let updateArgs = (prisma.roster.update as jest.Mock).mock.calls[0][0];
    expect(updateArgs.data).toEqual({ status: StatusEnum.PRFAILED });

    jest.clearAllMocks();

    (mergePullRequest as jest.Mock).mockImplementationOnce(() => Promise.reject());
    await handler(req, res);

    expect(res.statusCode).toBe(500);
    expect(createEvent).toHaveBeenCalledTimes(1);
    createEventArgs = (createEvent as jest.Mock).mock.calls[0][0];
    expect(createEventArgs.eventCode).toBe(EventEnum.REQUEST_RESTORE_FAILED);

    expect(prisma.roster.update).toHaveBeenCalledTimes(1);
    updateArgs = (prisma.roster.update as jest.Mock).mock.calls[0][0];
    expect(updateArgs.data).toEqual({ status: StatusEnum.PRFAILED });
  });

  it("sends an email to the the realm owners and cc's our team", async () => {
    const { req, res } = createMocks({ method: 'POST' });
    await handler(req, res);

    expect(sendEmail).toHaveBeenCalledTimes(1);
    const emailArgs = (sendEmail as jest.Mock).mock.calls[0][0];

    expect(emailArgs.to.includes(PO_EMAIL)).toBeTruthy();
    expect(emailArgs.to.includes(TECHNICAL_CONTACT_EMAIL)).toBeTruthy();
    expect(emailArgs.cc.includes(ssoTeamEmail)).toBeTruthy();

    // Includes the updater
    expect(
      emailArgs.body.includes(`We have received a request from ${ADMIN_FIRST_NAME} ${ADMIN_LAST_NAME}`),
    ).toBeTruthy();
  });

  it('Updates the expected realm fields in the database', async () => {
    const { req, res } = createMocks({ method: 'POST' });
    await handler(req, res);

    expect(prisma.roster.update).toHaveBeenCalledTimes(1);
    const updateArgs = (prisma.roster.update as jest.Mock).mock.calls[0][0];
    expect(updateArgs.data).toEqual({
      lastUpdatedBy: `${ADMIN_LAST_NAME}, ${ADMIN_FIRST_NAME}`,
      archived: false,
      prNumber: PR_NUMBER,
      status: StatusEnum.PRSUCCESS,
    });
  });
});
