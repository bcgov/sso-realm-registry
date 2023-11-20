import React from 'react';
import { render, screen, within, waitFor, prettyDOM } from '@testing-library/react';
import App from 'pages/_app';
import CustomRealmDashboard from 'pages/custom-realm-dashboard';
import { updateRealmProfile } from 'services/realm';
import { CustomRealmFormData } from 'types/realm-profile';
import Router from 'next/router';
import { CustomRealms } from './fixtures';

jest.mock('services/realm', () => {
  return {
    deleteRealmRequest: jest.fn((realmInfo: CustomRealmFormData) => Promise.resolve([true, null])),
    updateRealmProfile: jest.fn((id: number, status: string) => Promise.resolve([true, null])),
  };
});

jest.mock('next/router', () => ({
  useRouter() {
    return {
      route: '/',
      pathname: '',
      query: '',
      asPath: '',
      push: jest.fn(() => Promise.resolve(true)),
      events: {
        on: jest.fn(),
        off: jest.fn(),
      },
      beforePopState: jest.fn(() => null),
      prefetch: jest.fn(() => null),
    };
  },
}));

// Mock authentication
const mockSession = {
  expires: new Date(Date.now() + 2 * 86400).toISOString(),
  user: { username: 'admin' },
};
jest.mock('next-auth/react', () => {
  const originalModule = jest.requireActual('next-auth/react');
  return {
    __esModule: true,
    ...originalModule,
    useSession: jest.fn(() => {
      return { data: mockSession, status: 'authenticated' }; // return type is [] in v3 but changed to {} in v4
    }),
  };
});

jest.mock('next-auth/next', () => {
  return {
    __esModule: true,
    getServerSession: jest.fn(() => {
      return { data: mockSession, status: 'authenticated' };
    }),
  };
});

jest.mock('../pages/api/realms', () => {
  return {
    __esModule: true,
    getAllRealms: jest.fn(() => Promise.resolve([CustomRealms, null])),
    authOptions: {},
  };
});

jest.mock('../pages/api/auth/[...nextauth]', () => {
  return {
    __esModule: true,
    authOptions: {},
  };
});

describe('Table', () => {
  it('Loads in table data from serverside props', () => {
    render(<CustomRealmDashboard defaultRealmRequests={CustomRealms} />);
    const table = screen.getByTestId('custom-realm-table');
    expect(within(table).getByText('realm 1'));
    expect(within(table).getByText('realm 2'));
  });
});

describe('Status update', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('Prompts modal for request approval', async () => {
    render(
      <App
        Component={CustomRealmDashboard}
        pageProps={{ session: {}, defaultRealmRequests: CustomRealms }}
        router={Router as any}
      />,
    );

    screen.getByText('Access Request').click();
    await waitFor(() => screen.getByText('Approve Custom Realm', { selector: 'button' }).click());
    await waitFor(() => screen.getByText('Are you sure you want to approve request 1?'));
  });

  it('Prompts modal for request declination', async () => {
    render(
      <App
        Component={CustomRealmDashboard}
        pageProps={{ session: {}, defaultRealmRequests: CustomRealms }}
        router={Router as any}
      />,
    );
    screen.getByText('Access Request').click();
    await waitFor(() => screen.getByText('Decline Custom Realm', { selector: 'button' }).click());
    await waitFor(() => screen.getByText('Are you sure you want to decline request 1?'));
  });

  it('Fires expected api request when approving', async () => {
    render(
      <App
        Component={CustomRealmDashboard}
        pageProps={{ session: {}, defaultRealmRequests: CustomRealms }}
        router={Router as any}
      />,
    );
    screen.getByText('Access Request').click();
    await waitFor(() => screen.getByText('Approve Custom Realm', { selector: 'button' }).click());
    await waitFor(() => screen.getByText('Are you sure you want to approve request 1?'));
    screen.getByText('Confirm', { selector: 'button' }).click();

    const payload = (updateRealmProfile as jest.Mock).mock.calls[0][1];
    expect(payload.approved).toBeTruthy();
  });

  it('Fires expected api request when declining', async () => {
    render(
      <App
        Component={CustomRealmDashboard}
        pageProps={{ session: {}, defaultRealmRequests: CustomRealms }}
        router={Router as any}
      />,
    );
    screen.getByText('Access Request').click();
    await waitFor(() => screen.getByText('Decline Custom Realm', { selector: 'button' }).click());
    await waitFor(() => screen.getByText('Are you sure you want to decline request 1?'));
    screen.getByText('Confirm', { selector: 'button' }).click();

    const payload = (updateRealmProfile as jest.Mock).mock.calls[0][1];
    expect(payload.approved).toBeFalsy();
  });

  it('Updates status in table only when successfully approved', async () => {
    render(
      <App
        Component={CustomRealmDashboard}
        pageProps={{ session: {}, defaultRealmRequests: CustomRealms }}
        router={Router as any}
      />,
    );
    (updateRealmProfile as jest.MockedFunction<any>).mockImplementationOnce(() =>
      Promise.resolve([null, { message: 'failure' }]),
    );
    screen.getByText('Access Request').click();
    await waitFor(() => screen.getByText('Approve Custom Realm', { selector: 'button' }).click());
    await waitFor(() => screen.getByText('Are you sure you want to approve request 1?'));
    screen.getByText('Confirm', { selector: 'button' }).click();

    // Still pending
    const firstRow = screen.getByTestId('custom-realm-row-1');
    within(firstRow).getByText('pending');

    // Successful request
    (updateRealmProfile as jest.MockedFunction<any>).mockImplementationOnce(() => Promise.resolve([true, null]));
    screen.getByText('Approve Custom Realm', { selector: 'button' }).click();
    screen.getByText('Confirm', { selector: 'button' }).click();
    await waitFor(() => within(firstRow).getByText('Approved'));
  });

  it('Updates status in table only when successfully declined', async () => {
    render(
      <App
        Component={CustomRealmDashboard}
        pageProps={{ session: {}, defaultRealmRequests: CustomRealms }}
        router={Router as any}
      />,
    );
    (updateRealmProfile as jest.MockedFunction<any>).mockImplementationOnce(() =>
      Promise.resolve([null, { message: 'failure' }]),
    );
    screen.getByText('Access Request').click();
    await waitFor(() => screen.getByText('Decline Custom Realm', { selector: 'button' }).click());
    await waitFor(() => screen.getByText('Are you sure you want to decline request 1?'));
    screen.getByText('Confirm', { selector: 'button' }).click();

    // Still pending
    const firstRow = screen.getByTestId('custom-realm-row-1');
    within(firstRow).getByText('pending');

    // Successful request
    (updateRealmProfile as jest.MockedFunction<any>).mockImplementationOnce(() => Promise.resolve([true, null]));
    screen.getByText('Decline Custom Realm', { selector: 'button' }).click();
    screen.getByText('Confirm', { selector: 'button' }).click();
    await waitFor(() => within(firstRow).getByText('Declined'));
  });
});
