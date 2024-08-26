import { createMocks } from 'node-mocks-http';
import deleteHandler from '../../pages/api/realms/[id]';
import githubResponseHandler from '../../pages/api/realms/pending';
import prisma from 'utils/prisma';
import { CustomRealmProfiles, MockHttpRequest } from '../fixtures';
import { getServerSession } from 'next-auth';
import { deleteCustomRealm, removeUserAsRealmAdmin } from 'controllers/keycloak';
import { sendDeletionCompleteEmail } from 'utils/mailer';

jest.mock('../../controllers/keycloak', () => {
  return {
    removeUserAsRealmAdmin: jest.fn(),
    createCustomRealm: jest.fn(() => true),
    disableCustomRealm: jest.fn(() => true),
    deleteCustomRealm: jest.fn(() => true),
  };
});

jest.mock('../../utils/mailer', () => {
  return {
    sendUpdateEmail: jest.fn(),
    sendDeleteEmail: jest.fn(),
    sendDeletionCompleteEmail: jest.fn(() => Promise.resolve(true)),
  };
});

jest.mock('../../utils/github', () => {
  return {
    createCustomRealmPullRequest: jest.fn(() => Promise.resolve({ data: { number: 1 } })),
    mergePullRequest: jest.fn(() => Promise.resolve({ data: { merged: true } })),
    deleteBranch: jest.fn(),
  };
});

jest.mock('next/config', () => () => ({
  serverRuntimeConfig: {
    gh_api_token: 'secret',
  },
}));

const mockSession = {
  expires: new Date(Date.now() + 2 * 86400).toISOString(),
  user: {
    username: 'test',
    family_name: 'test',
    idir_username: 'test',
  },
  status: 'authenticated',
};

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

const mockAdminSession = () => {
  (getServerSession as jest.Mock).mockImplementation(() => {
    return {
      ...mockSession,
      user: {
        ...mockSession.user,
        client_roles: ['sso-admin'],
      },
    };
  });
};

describe('Realm Delete Request', () => {
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
    expect(deleteCustomRealm).toHaveBeenCalledTimes(3);
  });
});

describe('Github Actions Delete', () => {
  const mockToken = 'secret';
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.roster.findUnique as jest.Mock).mockImplementation(() => {
      return Promise.resolve({ ...CustomRealmProfiles[0], id: 1, archived: true });
    });
  });
  const requestData = {
    method: 'PUT' as 'PUT',
    body: {
      ids: [1],
      action: 'tf_apply',
      success: 'true',
    },
    headers: {
      Authorization: mockToken,
    },
  };

  it('requires api token', async () => {
    let { req, res }: MockHttpRequest = createMocks(requestData);
    await githubResponseHandler(req, res);
    expect(res.statusCode).toBe(200);

    // Remove auth header
    ({ req, res } = createMocks({ ...requestData, headers: { Authorization: 'empty' } }));
    await githubResponseHandler(req, res);
    expect(res.statusCode).toBe(401);
  });

  it('Removes technical contact and product owner from all envirionments', async () => {
    const { req, res }: MockHttpRequest = createMocks(requestData);
    await githubResponseHandler(req, res);
    expect(res.statusCode).toBe(200);

    // Email only sent once
    expect(sendDeletionCompleteEmail).toHaveBeenCalledTimes(1);

    // PO email and technical contact email removed in each realm
    ['dev', 'test', 'prod'].forEach((env) => {
      expect(removeUserAsRealmAdmin).toHaveBeenCalledWith(['a@b.com', 'b@c.com'], env, 'realm 1');
    });
    // No extra calls
    expect(removeUserAsRealmAdmin).toHaveBeenCalledTimes(3);
  });

  it('Only sends deletion complete email if all users removed successfully', async () => {
    const { req, res }: MockHttpRequest = createMocks(requestData);
    (removeUserAsRealmAdmin as jest.Mock).mockImplementationOnce(() => Promise.reject(new Error('failure')));
    await githubResponseHandler(req, res);

    expect(res.statusCode).toBe(500);
    expect(sendDeletionCompleteEmail).not.toHaveBeenCalled();
  });

  it('calls kc admin api to disable realm in all environments', async () => {
    (prisma.roster.findUnique as jest.Mock).mockImplementation(() => {
      return Promise.resolve(CustomRealmProfiles[0]);
    });
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
    const { req, res }: MockHttpRequest = createMocks({
      method: 'DELETE',
      query: { id: 1 },
    });
    await deleteHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(deleteCustomRealm).toHaveBeenCalledTimes(3);
  });
});
