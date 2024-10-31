import React from 'react';
import { render, screen, within, waitFor, fireEvent } from '@testing-library/react';
import App from 'pages/_app';
import CustomRealmDashboard from 'pages/custom-realm-dashboard';
import { getRealmProfiles, updateRealmProfile } from 'services/realm';
import { getRealmEvents } from 'services/events';
import { CustomRealmFormData } from 'types/realm-profile';
import Router from 'next/router';
import { CustomRealms } from './fixtures';
import { debug } from 'jest-preview';

jest.mock('services/realm', () => {
  return {
    deleteRealmRequest: jest.fn((realmInfo: CustomRealmFormData) => Promise.resolve([true, null])),
    updateRealmProfile: jest.fn((id: number, status: string) => Promise.resolve([true, null])),
    getRealmProfiles: jest.fn((excludeArchived: boolean) => Promise.resolve([CustomRealms, null])),
  };
});

jest.mock('services/events', () => {
  return {
    getRealmEvents: jest.fn((realmId: string) => {
      if (realmId === '1') {
        return Promise.resolve([
          [
            {
              id: 1,
              idirUserId: 'idir',
              createdAt: '2023-11-10T20:25:06.856Z',
              eventCode: 'request-create-success',
              realmId: 1,
            },
          ],
        ]);
      } else {
        return Promise.resolve([
          [
            {
              id: 1,
              idirUserId: 'idir',
              createdAt: '2023-11-11T20:25:06.856Z',
              eventCode: 'request-update-success',
              realmId: 2,
            },
          ],
        ]);
      }
    }),
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
  it('Loads in table data from serverside props', async () => {
    render(<CustomRealmDashboard />);
    await waitFor(() => screen.getByText('realm 1'));
    await waitFor(() => screen.getByText('realm 2'));
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
    await waitFor(() => screen.getByText('realm 1'));
    fireEvent.click(screen.getByText('realm 1'));
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
    await waitFor(() => screen.getByText('realm 1'));
    fireEvent.click(screen.getByText('realm 1'));
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
    await waitFor(() => screen.getByText('realm 1'));
    fireEvent.click(screen.getByText('realm 1'));
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
    await waitFor(() => screen.getByText('realm 1'));
    fireEvent.click(screen.getByText('realm 1'));
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
    await waitFor(() => screen.getByText('realm 1'));
    (updateRealmProfile as jest.MockedFunction<any>).mockImplementationOnce(() =>
      Promise.resolve([null, { message: 'failure' }]),
    );

    const table = screen.getByRole('table');
    const tbody = table.querySelector('tbody') as HTMLTableSectionElement;
    fireEvent.click(screen.getByText('realm 1'));
    screen.getByText('Access Request').click();
    await waitFor(() => screen.getByText('Approve Custom Realm', { selector: 'button' }).click());
    await waitFor(() => screen.getByText('Are you sure you want to approve request 1?'));
    screen.getByText('Confirm', { selector: 'button' }).click();

    let firstRow: any;
    await waitFor(() => {
      expect(screen.queryByTestId('grid-svg')).not.toBeInTheDocument();
    });

    firstRow = tbody.querySelector('tr') as HTMLTableRowElement;
    within(firstRow).queryByText('Pending');

    // Successful request
    (updateRealmProfile as jest.MockedFunction<any>).mockImplementationOnce(() => Promise.resolve([true, null]));
    await waitFor(() => screen.getByText('Approve Custom Realm', { selector: 'button' }).click());
    await waitFor(() => screen.getByText('Are you sure you want to approve request 1?'));
    screen.getByText('Confirm', { selector: 'button' }).click();
    await waitFor(() => screen.getByText('realm 1'));
  });

  it('Updates status in table only when successfully declined', async () => {
    render(
      <App
        Component={CustomRealmDashboard}
        pageProps={{ session: {}, defaultRealmRequests: CustomRealms }}
        router={Router as any}
      />,
    );
    await waitFor(() => screen.getByText('realm 1'));
    (updateRealmProfile as jest.MockedFunction<any>).mockImplementationOnce(() =>
      Promise.resolve([null, { message: 'failure' }]),
    );
    const table = screen.getByRole('table');
    const tbody = table.querySelector('tbody') as HTMLTableSectionElement;
    fireEvent.click(screen.getByText('realm 1'));

    screen.getByText('Access Request').click();
    await waitFor(() => screen.getByText('Decline Custom Realm', { selector: 'button' }).click());
    await waitFor(() => screen.getByText('Are you sure you want to decline request 1?'));
    const confirmButton = screen.getByText('Confirm', { selector: 'button' });
    fireEvent.click(confirmButton);

    let firstRow: any;
    await waitFor(() => {
      expect(screen.queryByTestId('grid-svg')).not.toBeInTheDocument();
    });

    firstRow = tbody.querySelectorAll('tr') as any;

    within(firstRow[2]).queryByText('Pending');

    // Successful request
    (updateRealmProfile as jest.MockedFunction<any>).mockImplementationOnce(() => Promise.resolve([true, null]));
    await waitFor(() => screen.getByText('Decline Custom Realm', { selector: 'button' }).click());
    await waitFor(() => screen.getByText('Are you sure you want to decline request 1?'));
    screen.getByText('Confirm', { selector: 'button' }).click();
    await waitFor(() => within(firstRow[2]).queryByText('Declined'));
  });
});

describe('Events table', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('fetches correct events when selected row changes', async () => {
    render(<CustomRealmDashboard />);
    await waitFor(() => screen.getByText('realm 1'));
    const row1 = screen.getByText('realm 1');
    fireEvent.click(row1);
    expect(getRealmEvents).toHaveBeenCalledTimes(1);
    // Called with correct realm id
    expect(getRealmEvents).toHaveBeenCalledWith('1');

    const row2 = screen.getByText('realm 2');
    fireEvent.click(row2);

    await waitFor(() => expect(getRealmEvents).toHaveBeenCalledTimes(2));
    // Called with correct realm id
    expect(getRealmEvents).toHaveBeenCalledWith('2');
  });

  it('displays events for the selected realm and updates when changing rows', async () => {
    render(<CustomRealmDashboard />);
    await waitFor(() => screen.getByText('realm 1'));
    const firstRealmRow = screen.getByText('realm 1');
    fireEvent.click(firstRealmRow);
    const eventTab = screen.getByText('Events');
    fireEvent.click(eventTab);

    // Expect only realm 1 event to show
    await waitFor(() => screen.getByText('request-create-success'));
    expect(screen.queryByText('request-update-success')).toBeNull();
    const secondRealmRow = screen.getByText('realm 2');
    fireEvent.click(secondRealmRow);
    await waitFor(() => screen.getByText('request-update-success'));
    expect(screen.queryByText('request-create-success')).toBeNull();
  });

  it('flashes an error message if network request fails', async () => {
    (getRealmEvents as jest.MockedFunction<any>).mockImplementationOnce(() =>
      Promise.resolve([null, { message: 'failure' }]),
    );
    render(
      <App
        Component={CustomRealmDashboard}
        pageProps={{ session: {}, defaultRealmRequests: CustomRealms }}
        router={Router as any}
      />,
    );
    await waitFor(() => screen.getByText('realm 1'));
    fireEvent.click(screen.getByText('realm 1'));
    await waitFor(() => screen.getByText('Network error when fetching realm events.'));
  });
});
