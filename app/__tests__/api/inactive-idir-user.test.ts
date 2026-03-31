import { createMocks } from 'node-mocks-http';
import handler from '../../pages/api/users/[id]';
import prisma from 'utils/prisma';
import { MockHttpRequest, roster } from '../fixtures';
import { createMockSendEmail, mockSession } from './utils/mocks';
import { ssoTeamEmail } from 'utils/mailer';

jest.mock('utils/ches');

jest.mock('next-auth/next', () => {
  return {
    __esModule: true,
    getServerSession: jest.fn(() => {
      return mockSession;
    }),
  };
});

const DELETED_USER_ID = 'DEL';
const DELETED_USER_EMAIL = 'DEL@MAIL';

const TC_MAIL = 'TC@MAIL';
const TC_ID = 'TC';
const PO_ID = 'PO';
const PO_MAIL = 'PO@MAIL';
const TC_2_ID = 'TC2';
const TC_2_MAIL = 'TC2@mail';

const baseRoster = {
  ...roster,
  productOwnerEmail: PO_MAIL,
  productOwnerIdirUserId: PO_ID,
  technicalContactEmail: TC_MAIL,
  technicalContactIdirUserId: TC_ID,
  secondTechnicalContactEmail: TC_2_MAIL,
  secondTechnicalContactIdirUserId: TC_2_ID,
};
const testCases = [
  {
    poDeleted: true,
    tcDeleted: false,
    tc2Deleted: false,
    roster: {
      ...baseRoster,
      realm: 'realm 1',
      productOwnerEmail: DELETED_USER_EMAIL,
      productOwnerIdirUserId: DELETED_USER_ID,
    },
  },
  {
    poDeleted: false,
    tcDeleted: true,
    tc2Deleted: false,
    roster: {
      ...baseRoster,
      realm: 'realm 2',
      technicalContactEmail: DELETED_USER_EMAIL,
      technicalContactIdirUserId: DELETED_USER_ID,
    },
  },
  {
    poDeleted: false,
    tcDeleted: false,
    tc2Deleted: true,
    roster: {
      ...baseRoster,
      realm: 'realm 3',
      secondTechnicalContactEmail: DELETED_USER_EMAIL,
      secondTechnicalContactIdirUserId: DELETED_USER_ID,
    },
  },
  {
    poDeleted: false,
    tcDeleted: true,
    tc2Deleted: true,
    roster: {
      ...baseRoster,
      realm: 'realm 4',
      technicalContactEmail: DELETED_USER_EMAIL,
      technicalContactIdirUserId: DELETED_USER_ID,
      secondTechnicalContactEmail: DELETED_USER_EMAIL,
      secondTechnicalContactIdirUserId: DELETED_USER_ID,
    },
  },
  {
    poDeleted: true,
    tcDeleted: true,
    tc2Deleted: true,
    roster: {
      ...baseRoster,
      realm: 'realm 5',
      productOwnerEmail: DELETED_USER_EMAIL,
      productOwnerIdirUserId: DELETED_USER_ID,
      technicalContactEmail: DELETED_USER_EMAIL,
      technicalContactIdirUserId: DELETED_USER_ID,
      secondTechnicalContactEmail: DELETED_USER_EMAIL,
      secondTechnicalContactIdirUserId: DELETED_USER_ID,
    },
  },
];

const mockPrismaRoster = () =>
  (prisma.roster.findMany as jest.Mock).mockImplementation(() => {
    return Promise.resolve(testCases.map((testCase) => testCase.roster));
  });

describe('IDIR user deletion', () => {
  const { req, res }: MockHttpRequest = createMocks({
    method: 'DELETE',
    headers: { authorization: process.env.API_AUTH_SECRET },
    query: { id: DELETED_USER_ID },
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrismaRoster();
  });

  it('Emails the other realm owners when a user is deleted', async () => {
    const emailList = createMockSendEmail();
    await handler(req, res);

    testCases.forEach((testCase, i) => {
      const email = emailList[i];

      // Should email the PO unless they were deleted
      if (!testCase.poDeleted) expect(email.to.includes(PO_MAIL)).toBeTruthy();
      else expect(email.to.includes(PO_MAIL)).not.toBeTruthy();

      // Should email the Tech Lead unless they were deleted
      if (!testCase.tcDeleted) expect(email.to.includes(TC_MAIL)).toBeTruthy();
      else expect(email.to.includes(TC_MAIL)).not.toBeTruthy();

      // Secondary TC should not be notified, as they are optional
      expect(email.to.includes(TC_2_MAIL)).not.toBeTruthy();
    });
  });

  it('Emails the sso team when any user is deleted including their realms and roles', async () => {
    const emailList = createMockSendEmail();
    await handler(req, res);

    const teamEmails = emailList.filter((email) => email.to.includes(ssoTeamEmail));
    expect(teamEmails.length).toBe(1);
    const teamEmail = teamEmails[0];

    // Fetch bullet items to check realms and contact lists
    const listItems = [...teamEmail.body.matchAll(/<li>(.*?)<\/li>/g)].map((m) => m[1]);

    testCases.forEach((testCase, i) => {
      const listItem = listItems[i];

      // List item should include the realm name and the members removed
      expect(listItem.includes(testCase.roster.realm));
      if (testCase.poDeleted) expect(listItem.includes('Product Owner')).toBeTruthy();
      if (testCase.tcDeleted) expect(listItem.includes('Primary Technical Contact')).toBeTruthy();
      if (testCase.tc2Deleted) expect(listItem.includes('Secondary Technical Contact')).toBeTruthy();
    });
  });
});
