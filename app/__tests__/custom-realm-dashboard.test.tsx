import React from "react";
import { render, screen, fireEvent, within, waitForElementToBeRemoved, waitFor } from "@testing-library/react";
import App from 'pages/_app';
import CustomRealmDashboard from "pages/custom-realm-dashboard";
import { deleteRealmRequest, updateRealmRequestStatus } from 'services/realm'
import { CustomRealmFormData } from "types/realm-profile";
import Router from 'next/router'

jest.mock('services/realm', () => {
  return {
    deleteRealmRequest: jest.fn((realmInfo: CustomRealmFormData) => Promise.resolve([true, null])),
    updateRealmRequestStatus: jest.fn((id: number, status: string) => Promise.resolve([true, null])),
  }
})

jest.mock('next/router', () => ({
  useRouter() {
    return ({
      route: '/',
      pathname: '',
      query: '',
      asPath: '',
      push: jest.fn(() => Promise.resolve(true)),
      events: {
        on: jest.fn(),
        off: jest.fn()
      },
      beforePopState: jest.fn(() => null),
      prefetch: jest.fn(() => null)
    });
  },
}));

// Mock authentication
jest.mock("next-auth/react", () => {
  const originalModule = jest.requireActual('next-auth/react');
  const mockSession = {
    expires: new Date(Date.now() + 2 * 86400).toISOString(),
    user: { username: "admin" }
  };
  return {
    __esModule: true,
    ...originalModule,
    useSession: jest.fn(() => {
      return { data: mockSession, status: 'authenticated' }  // return type is [] in v3 but changed to {} in v4
    }),
  };
});

const defaultData: CustomRealmFormData[] = [
  {
    id: 1,
    realmName: 'realm 1',
    realmPurpose: 'purpose',
    primaryUsers: {
      livingInBC: true,
      businessInBC: true,
      govEmployees: true,
      other: true,
      otherDetails: 'details'
    },
    environments: {
      dev: true,
      test: true,
      prod: true,
    },
    loginIdp: 'idir',
    productOwnerEmail: 'a@b.com',
    productOwnerIdir: 'me',
    technicalContactEmail: 'b@c.com',
    technicalContactIdir: 'd@e.com',
    secondaryTechnicalContactIdir: 'dmsd',
    secondaryTechnicalContactEmail: 'dksadlks@fkjlsdj.com',
    status: 'pending',
  },
  {
    id: 2,
    realmName: 'realm 2',
    realmPurpose: 'purpose',
    primaryUsers: {
      livingInBC: true,
      businessInBC: true,
      govEmployees: true,
      other: true,
      otherDetails: 'details'
    },
    environments: {
      dev: true,
      test: true,
      prod: true,
    },
    loginIdp: 'idir',
    productOwnerEmail: 'a@b.com',
    productOwnerIdir: 'me',
    technicalContactEmail: 'b@c.com',
    technicalContactIdir: 'd@e.com',
    secondaryTechnicalContactIdir: 'dmsd',
    secondaryTechnicalContactEmail: 'dksadlks@fkjlsdj.com',
    status: 'pending'
  }
]

describe('Table', () => {
  it('Loads in table data from serverside props', () => {
    render(<CustomRealmDashboard defaultRealmRequests={defaultData} />)
    const table = screen.getByTestId('custom-realm-table')
    expect(within(table).getByText('realm 1'))
    expect(within(table).getByText('realm 2'))
  })

  const clickDeleteRowButton = (id: number) => {
    const firstRow = screen.getByTestId(`custom-realm-row-${id}`);
    const firstRowDeleteBtn = within(firstRow).getByTestId('delete-btn');
    fireEvent.click(firstRowDeleteBtn)
  }

  it('Prompts modal for deletion with expected id', () => {
    render(<App
      Component={CustomRealmDashboard}
      pageProps={{ session: {}, defaultRealmRequests: defaultData }}
      router={Router as any}
    />);

    clickDeleteRowButton(1)
    screen.getByText('Are you sure you want to delete request 1?');

    // Cancel and check other row changes id
    screen.getByText('Cancel', { selector: 'button' }).click();
    clickDeleteRowButton(2)
    screen.getByText('Are you sure you want to delete request 2?');
  })

  it('fires the expected API request when deleting', () => {
    render(<App
      Component={CustomRealmDashboard}
      pageProps={{ session: {}, defaultRealmRequests: defaultData }}
      router={Router as any}
    />);

    clickDeleteRowButton(1)
    fireEvent.click(screen.getByText('Confirm', { selector: 'button' }))
    expect(deleteRealmRequest).toHaveBeenCalledWith(1)
  })

  it('Clears row from table when deletion is successful', async () => {
    render(<App
      Component={CustomRealmDashboard}
      pageProps={{ session: {}, defaultRealmRequests: defaultData }}
      router={Router as any}
    />);

    clickDeleteRowButton(1)
    fireEvent.click(screen.getByText('Confirm', { selector: 'button' }))
    expect(deleteRealmRequest).toHaveBeenCalledWith(1)
    await waitForElementToBeRemoved(() => screen.queryAllByText('realm 1'))
  })

  it('Keeps row in table when deletion fails', async () => {
    render(<App
      Component={CustomRealmDashboard}
      pageProps={{ session: {}, defaultRealmRequests: defaultData }}
      router={Router as any}
    />);
    (deleteRealmRequest as jest.MockedFunction<any>).mockImplementationOnce(
      () => Promise.resolve([null, { message: 'failure' }])
    )
    clickDeleteRowButton(1)
    fireEvent.click(screen.getByText('Confirm', { selector: 'button' }));
    
    await waitFor(() => expect(deleteRealmRequest).toHaveBeenCalledWith(1))
    expect(screen.queryByTestId('custom-realm-row-1')).not.toBeNull()
  })

})

describe('Status update', () => {

  it('Prompts modal for request approval', async () => {
    render(<App
      Component={CustomRealmDashboard}
      pageProps={{ session: {}, defaultRealmRequests: defaultData }}
      router={Router as any}
    />);
    screen.getByText('Access Request').click()
    await waitFor(() => screen.getByText('Approve Custom Realm', { selector: 'button' }).click());
    await waitFor(() => screen.getByText('Are you sure you want to approve request 1?'));
  })

  it('Prompts modal for request declination', async () => {
    render(<App
      Component={CustomRealmDashboard}
      pageProps={{ session: {}, defaultRealmRequests: defaultData }}
      router={Router as any}
    />);
    screen.getByText('Access Request').click()
    await waitFor(() => screen.getByText('Decline Custom Realm', { selector: 'button' }).click());
    await waitFor(() => screen.getByText('Are you sure you want to decline request 1?'));
  })

  it('Fires expected api request when approving', async () => {
    render(<App
      Component={CustomRealmDashboard}
      pageProps={{ session: {}, defaultRealmRequests: defaultData }}
      router={Router as any}
    />);
    screen.getByText('Access Request').click()
    await waitFor(() => screen.getByText('Approve Custom Realm', { selector: 'button' }).click());
    await waitFor(() => screen.getByText('Are you sure you want to approve request 1?'));
    screen.getByText('Confirm', { selector: 'button' }).click()
    expect(updateRealmRequestStatus).toHaveBeenCalledWith(1, 'approved')
  })

  it('Fires expected api request when declining', async () => {
    render(<App
      Component={CustomRealmDashboard}
      pageProps={{ session: {}, defaultRealmRequests: defaultData }}
      router={Router as any}
    />);
    screen.getByText('Access Request').click()
    await waitFor(() => screen.getByText('Decline Custom Realm', { selector: 'button' }).click());
    await waitFor(() => screen.getByText('Are you sure you want to decline request 1?'));
    screen.getByText('Confirm', { selector: 'button' }).click()
    expect(updateRealmRequestStatus).toHaveBeenCalledWith(1, 'declined')
  })

  it('Updates status in table only when successfully approved', async () => {
    render(<App
      Component={CustomRealmDashboard}
      pageProps={{ session: {}, defaultRealmRequests: defaultData }}
      router={Router as any}
    />);
    (updateRealmRequestStatus as jest.MockedFunction<any>).mockImplementationOnce(
      () => Promise.resolve([null, { message: 'failure' }])
    )
    screen.getByText('Access Request').click()
    await waitFor(() => screen.getByText('Approve Custom Realm', { selector: 'button' }).click());
    await waitFor(() => screen.getByText('Are you sure you want to approve request 1?'));
    screen.getByText('Confirm', { selector: 'button' }).click()

    // Still pending
    const firstRow = screen.getByTestId('custom-realm-row-1');
    within(firstRow).getByText('pending');

    // Successful request
    (updateRealmRequestStatus as jest.MockedFunction<any>).mockImplementationOnce(
      () => Promise.resolve([true, null])
    );
    screen.getByText('Approve Custom Realm', { selector: 'button' }).click()
    screen.getByText('Confirm', { selector: 'button' }).click();
    await waitFor(() => within(firstRow).getByText('approved'));
  })

  it('Updates status in table only when successfully declined', async () => {
    render(<App
      Component={CustomRealmDashboard}
      pageProps={{ session: {}, defaultRealmRequests: defaultData }}
      router={Router as any}
    />);
    (updateRealmRequestStatus as jest.MockedFunction<any>).mockImplementationOnce(
      () => Promise.resolve([null, { message: 'failure' }])
    )
    screen.getByText('Access Request').click()
    await waitFor(() => screen.getByText('Decline Custom Realm', { selector: 'button' }).click());
    await waitFor(() => screen.getByText('Are you sure you want to decline request 1?'));
    screen.getByText('Confirm', { selector: 'button' }).click()

    // Still pending
    const firstRow = screen.getByTestId('custom-realm-row-1');
    within(firstRow).getByText('pending');

    // Successful request
    (updateRealmRequestStatus as jest.MockedFunction<any>).mockImplementationOnce(
      () => Promise.resolve([true, null])
    );
    screen.getByText('Decline Custom Realm', { selector: 'button' }).click()
    screen.getByText('Confirm', { selector: 'button' }).click();
    await waitFor(() => within(firstRow).getByText('declined'));
  })
})