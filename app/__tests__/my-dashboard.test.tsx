import React from 'react';
import { render, screen, within } from '@testing-library/react';
import MyDashboard from 'pages/my-dashboard';
import { CustomRealmFormData } from 'types/realm-profile';
import { CustomRealmProfiles } from './fixtures';
import { useSession } from 'next-auth/react';

const PRODUCT_OWNER_IDIR_USERID = 'po';

jest.mock('services/meta', () => {
  return {
    getBranches: jest.fn(() => Promise.resolve([[], null])),
    getDivisions: jest.fn(() => Promise.resolve([[], null])),
    getMinistries: jest.fn(() => Promise.resolve([[], null])),
  };
});

jest.mock('services/realm', () => {
  return {
    submitRealmRequest: jest.fn((realmInfo: CustomRealmFormData) => Promise.resolve([true, null])),
    getRealmProfiles: jest.fn(() => Promise.resolve([CustomRealmProfiles, null])),
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
jest.mock('next-auth/react', () => {
  const originalModule = jest.requireActual('next-auth/react');
  const mockSession = {
    expires: new Date(Date.now() + 2 * 86400).toISOString(),
    user: { idir_username: 'tech lead' },
  };
  return {
    __esModule: true,
    ...originalModule,
    useSession: jest.fn(() => {
      return { data: mockSession, status: 'authenticated' }; // return type is [] in v3 but changed to {} in v4
    }),
  };
});

describe('Form Validation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const getFormInputs = async () => {
    const realmNameInput = (await screen.findByLabelText('Custom Realm name', { exact: false })) as HTMLInputElement;
    const productNameInput = (await screen.findByLabelText('Product Name', { exact: false })) as HTMLInputElement;
    const ministryInput = (await screen.findByLabelText('Ministry', { exact: false })) as HTMLInputElement;
    const divisionInput = (await screen.findByLabelText('Division', { exact: false })) as HTMLInputElement;
    const branchInput = (await screen.findByLabelText('Branch', { exact: false })) as HTMLInputElement;
    const realmPurposeInput = (await screen.findByLabelText('Purpose of Realm', { exact: false })) as HTMLInputElement;
    const primaryEndUserInput = (
      await screen.findByText('Who are the primary end users of your project', { exact: false })
    ).closest('fieldset') as HTMLFieldSetElement;
    const environmentsInput = (await screen.findByText('Select all applicable environments', { exact: false })).closest(
      'fieldset',
    ) as HTMLFieldSetElement;
    const poEmailInput = (await screen.findByLabelText("Product owner's email", { exact: false })) as HTMLInputElement;
    const poIdirInput = (await screen.findByLabelText("Product owner's IDIR", { exact: false })) as HTMLInputElement;
    const techContactEmailInput = (await screen.findByTestId('tech-contact-email', {
      exact: false,
    })) as HTMLInputElement;
    const techContactIdirInput = (await screen.findByTestId('tech-contact-email', {
      exact: false,
    })) as HTMLInputElement;
    const secondTechContactEmailInput = (await screen.findByLabelText("Secondary technical contact's email", {
      exact: false,
    })) as HTMLInputElement;
    const secondTechContactIdirInput = (await screen.findByLabelText("Secondary technical contact's idir", {
      exact: false,
    })) as HTMLInputElement;
    return {
      realmNameInput,
      productNameInput,
      ministryInput,
      divisionInput,
      branchInput,
      realmPurposeInput,
      primaryEndUserInput,
      environmentsInput,
      poEmailInput,
      poIdirInput,
      techContactEmailInput,
      techContactIdirInput,
      secondTechContactEmailInput,
      secondTechContactIdirInput,
    };
  };

  it('Enables/disables expected fields for a technical contact', async () => {
    render(<MyDashboard />);
    const firstRow = (await screen.findByText('realm 1')).closest('tr') as HTMLElement;
    const firstRowEditButton = within(firstRow).getByText('Edit');
    firstRowEditButton.click();

    const inputs = await getFormInputs();

    expect(inputs.realmNameInput.disabled).toBe(true);
    expect(inputs.productNameInput.disabled).toBe(true);
    expect(inputs.ministryInput.disabled).toBe(false);
    expect(inputs.divisionInput.disabled).toBe(false);
    expect(inputs.branchInput.disabled).toBe(false);
    expect(inputs.realmPurposeInput.disabled).toBe(true);
    expect(inputs.primaryEndUserInput.disabled).toBe(true);
    expect(inputs.environmentsInput.disabled).toBe(true);
    expect(inputs.poEmailInput.disabled).toBe(true);
    expect(inputs.poIdirInput.disabled).toBe(true);
    expect(inputs.techContactEmailInput.disabled).toBe(false);
    expect(inputs.techContactIdirInput.disabled).toBe(false);
    expect(inputs.secondTechContactEmailInput.disabled).toBe(false);
    expect(inputs.secondTechContactIdirInput.disabled).toBe(false);

    expect(screen.queryByTestId('rc-channel-input', { exact: false })).toBeNull();
    expect(screen.queryByTestId('rc-channel-owner-input', { exact: false })).toBeNull();
    expect(screen.queryByLabelText('Material To Send', { exact: false })).toBeNull();
  });

  it('Enables/disables expected fields for a product owner', async () => {
    (useSession as jest.Mock).mockImplementation(() => ({
      status: 'authenticated',
      data: {
        expires: new Date(Date.now() + 2 * 86400).toISOString(),
        user: { idir_username: PRODUCT_OWNER_IDIR_USERID },
      },
    }));
    render(<MyDashboard />);
    const firstRow = (await screen.findByText('realm 1')).closest('tr') as HTMLElement;
    const firstRowEditButton = within(firstRow).getByText('Edit');
    firstRowEditButton.click();

    const inputs = await getFormInputs();

    expect(inputs.realmNameInput.disabled).toBe(true);
    expect(inputs.productNameInput.disabled).toBe(false);
    expect(inputs.ministryInput.disabled).toBe(false);
    expect(inputs.divisionInput.disabled).toBe(false);
    expect(inputs.branchInput.disabled).toBe(false);
    expect(inputs.realmPurposeInput.disabled).toBe(false);
    expect(inputs.primaryEndUserInput.disabled).toBe(false);
    expect(inputs.environmentsInput.disabled).toBe(true);
    expect(inputs.poEmailInput.disabled).toBe(false);
    expect(inputs.poIdirInput.disabled).toBe(false);
    expect(inputs.techContactEmailInput.disabled).toBe(false);
    expect(inputs.techContactIdirInput.disabled).toBe(false);
    expect(inputs.secondTechContactEmailInput.disabled).toBe(false);
    expect(inputs.secondTechContactIdirInput.disabled).toBe(false);

    expect(screen.queryByTestId('rc-channel-input', { exact: false })).toBeNull();
    expect(screen.queryByTestId('rc-channel-owner-input', { exact: false })).toBeNull();
    expect(screen.queryByLabelText('Material To Send', { exact: false })).toBeNull();
  });

  it('Enables/disables expected fields for an admin', async () => {
    (useSession as jest.Mock).mockImplementation(() => ({
      status: 'authenticated',
      data: {
        expires: new Date(Date.now() + 2 * 86400).toISOString(),
        user: { idir_username: PRODUCT_OWNER_IDIR_USERID, client_roles: 'sso-admin' },
      },
    }));
    render(<MyDashboard />);
    const firstRow = (await screen.findByText('realm 1')).closest('tr') as HTMLElement;
    const firstRowEditButton = within(firstRow).getByText('Edit');
    firstRowEditButton.click();

    const inputs = await getFormInputs();

    expect(inputs.realmNameInput.disabled).toBe(true);
    expect(inputs.productNameInput.disabled).toBe(false);
    expect(inputs.ministryInput.disabled).toBe(false);
    expect(inputs.divisionInput.disabled).toBe(false);
    expect(inputs.branchInput.disabled).toBe(false);
    expect(inputs.realmPurposeInput.disabled).toBe(false);
    expect(inputs.primaryEndUserInput.disabled).toBe(false);
    expect(inputs.environmentsInput.disabled).toBe(true);
    expect(inputs.poEmailInput.disabled).toBe(false);
    expect(inputs.poIdirInput.disabled).toBe(false);
    expect(inputs.techContactEmailInput.disabled).toBe(false);
    expect(inputs.techContactIdirInput.disabled).toBe(false);
    expect(inputs.secondTechContactEmailInput.disabled).toBe(false);
    expect(inputs.secondTechContactIdirInput.disabled).toBe(false);

    expect(screen.queryByTestId('rc-channel-input', { exact: false })).not.toBeNull();
    expect(screen.queryByTestId('rc-channel-owner-input', { exact: false })).not.toBeNull();
    expect(screen.queryByLabelText('Material To Send', { exact: false })).not.toBeNull();
  });
});
