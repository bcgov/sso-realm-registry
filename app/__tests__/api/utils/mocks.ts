import { sendEmail } from 'utils/ches';
import { getServerSession } from 'next-auth';

const mockedSendEmail = sendEmail as jest.Mock<any>;
export const createMockSendEmail = () => {
  const result: any[] = [];
  mockedSendEmail.mockImplementation((data: any) => {
    result.push(data);
    return Promise.resolve(null);
  });

  return result;
};

export const mockSession = {
  expires: new Date(Date.now() + 2 * 86400).toISOString(),
  user: {
    username: 'test',
    given_name: 'test',
    family_name: 'test',
    idir_username: 'test',
  },
  status: 'authenticated',
};

export const mockUserSession = () => {
  (getServerSession as jest.Mock).mockImplementation(() => {
    return {
      ...mockSession,
    };
  });
};

export const mockAdminSession = () => {
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
