import React from 'react';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { CustomRealmProfiles, CustomRealms } from './fixtures';
import RealmLeftPanel from 'page-partials/my-dashboard/RealmLeftPanel';
import { noop } from 'lodash';
import { RealmProfile } from 'types/realm-profile';

const editFunction = jest.fn();

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

describe('realm table', () => {
  it('loads all realms', () => {
    render(<RealmLeftPanel realms={CustomRealms as any} onCancel={noop} onEditClick={noop} onViewClick={noop} />);
  });

  it('edit button disabled if realm is not approved', async () => {
    render(
      <RealmLeftPanel realms={CustomRealmProfiles} onCancel={noop} onEditClick={editFunction} onViewClick={noop} />,
    );
    const table = screen.getByRole('table');
    const thirdRow = table.querySelector('tbody tr:nth-child(3)') as HTMLTableRowElement;
    expect(thirdRow).toBeInTheDocument();
    const editButton = within(thirdRow).getByRole('img', { name: 'Edit' });
    expect(editButton).toBeInTheDocument();
    fireEvent.click(editButton);
    expect(editFunction).toHaveBeenCalledTimes(0);
  });
});
