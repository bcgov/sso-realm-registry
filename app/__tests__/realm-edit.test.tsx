import React from 'react';
import { render, screen } from '@testing-library/react';
import EditPage, { getServerSideProps } from 'pages/realm/[rid]';
import { CustomRealmFormData } from 'types/realm-profile';
import { CustomRealmProfiles } from './fixtures';
import { useSession } from 'next-auth/react';
import prisma from 'utils/prisma';
import { getServerSession } from 'next-auth';

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

const MOCK_IDIR = 'idir';

jest.mock('next-auth', () => {
  return {
    __esModule: true,
    default: jest.fn(() => {}),
    getServerSession: jest.fn(() => {
      return {
        user: {
          idir_username: MOCK_IDIR,
        },
      };
    }),
  };
});

jest.mock('prisma', () => {
  return {
    __esModule: true,
    default: jest.fn(() => {}),
    roster: {
      findFirst: jest.fn(),
    },
  };
});

const testRealm: CustomRealmFormData = {
  realm: '',
  purpose: '',
  productName: '',
  primaryEndUsers: [],
  productOwnerEmail: '',
  productOwnerIdirUserId: PRODUCT_OWNER_IDIR_USERID,
  technicalContactEmail: '',
  technicalContactIdirUserId: '',
  secondTechnicalContactIdirUserId: '',
  secondTechnicalContactEmail: '',
};

describe('Server Fetching', () => {
  it('Requires non-admins to be a product owner, technical contact, or secondary contact to see the edit page', async () => {
    await getServerSideProps({ params: { rid: 1 } } as any);
    expect(prisma.roster.findFirst).toHaveBeenCalledTimes(1);
    const prismaArgs = (prisma.roster.findFirst as jest.Mock).mock.calls[0][0];

    // Checks the id
    expect(prismaArgs.where.id).toBe(1);

    // Also requires IDIR match
    expect(prismaArgs.where['OR']).toBeDefined();
    const technicalContactClause = prismaArgs.where['OR'].find((clause: any) =>
      Object.keys(clause).includes('technicalContactIdirUserId'),
    ).technicalContactIdirUserId;
    const secondaryTechnicalContactClause = prismaArgs.where['OR'].find((clause: any) =>
      Object.keys(clause).includes('secondTechnicalContactIdirUserId'),
    ).secondTechnicalContactIdirUserId;
    const productOwnerClause = prismaArgs.where['OR'].find((clause: any) =>
      Object.keys(clause).includes('productOwnerIdirUserId'),
    ).productOwnerIdirUserId;

    expect(technicalContactClause.equals).toBe(MOCK_IDIR);
    expect(secondaryTechnicalContactClause.equals).toBe(MOCK_IDIR);
    expect(productOwnerClause.equals).toBe(MOCK_IDIR);
  });

  it('Allows admins to always see the edit page', async () => {
    (getServerSession as jest.Mock).mockImplementation(() => ({
      user: {
        idir_username: MOCK_IDIR,
        client_roles: ['sso-admin'],
      },
    }));
    await getServerSideProps({ params: { rid: 1 } } as any);
    expect(prisma.roster.findFirst).toHaveBeenCalledTimes(1);
    const prismaArgs = (prisma.roster.findFirst as jest.Mock).mock.calls[0][0];
    expect(prismaArgs.where['OR']).not.toBeDefined();

    // sso-admin only checks the id
    expect(prismaArgs.where).toEqual({ id: 1 });
  });
});

describe.skip('Form Validation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const getFormInputs = async (container: HTMLElement) => {
    const realmNameInput = (await screen.findByLabelText('Custom Realm name', { exact: false })) as HTMLInputElement;
    const productNameInput = (await screen.findByLabelText('Product Name', { exact: false })) as HTMLInputElement;
    const ministryInput = (await screen.findByLabelText('Ministry', { exact: false })) as HTMLInputElement;
    const divisionInput = (await screen.findByLabelText('Division', { exact: false })) as HTMLInputElement;
    const branchInput = (await screen.findByLabelText('Branch', { exact: false })) as HTMLInputElement;
    const realmPurposeInput = (await screen.findByLabelText('Purpose of Realm', { exact: false })) as HTMLInputElement;
    const primaryEndUserInput = (
      await screen.findByText('Who are the primary end users of your project', { exact: false })
    ).closest('fieldset') as HTMLFieldSetElement;
    //const poEmailInput = (await screen.findByLabelText("Product owner's email", { exact: false })) as HTMLInputElement;
    const poEmailInput = container.querySelector('input.product-owner-email__input') as HTMLInputElement;
    const poIdirInput = (await screen.findByLabelText("Product owner's IDIR", { exact: false })) as HTMLInputElement;
    // const techContactEmailInput = (await screen.findByTestId('tech-contact-email', {
    //   exact: false,
    // })) as HTMLInputElement;
    const techContactEmailInput = container.querySelector('input.technical-contact-email__input') as HTMLInputElement;
    const techContactIdirInput = (await screen.findByTestId('tech-contact-idir', {
      exact: false,
    })) as HTMLInputElement;
    // const secondTechContactEmailInput = (await screen.findByLabelText("Secondary technical contact's email", {
    //   exact: false,
    // })) as HTMLInputElement;
    const secondTechContactEmailInput = container.querySelector(
      'input.secondary-contact-email__input',
    ) as HTMLInputElement;
    const secondTechContactIdirInput = (await screen.findByTestId('secondary-contact-idir', {
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
      poEmailInput,
      poIdirInput,
      techContactEmailInput,
      techContactIdirInput,
      secondTechContactEmailInput,
      secondTechContactIdirInput,
    };
  };

  it("Displays 'not found' when no realm can be retrieved", () => {
    render(<EditPage realm={null} />);
    screen.getByText('Not Found');
  });

  it("Displays 'not found' when no realm can be retrieved", () => {
    render(<EditPage realm={null} />);
    screen.getByText('Not Found');
  });

  it('Enables/disables expected fields for a technical contact', async () => {
    const { container } = render(<EditPage realm={testRealm} />);

    const inputs = await getFormInputs(container);

    expect(inputs.realmNameInput.disabled).toBe(true);
    expect(inputs.productNameInput.disabled).toBe(true);
    expect(inputs.ministryInput.disabled).toBe(false);
    expect(inputs.divisionInput.disabled).toBe(false);
    expect(inputs.branchInput.disabled).toBe(false);
    expect(inputs.realmPurposeInput.disabled).toBe(true);
    expect(inputs.primaryEndUserInput.disabled).toBe(true);
    expect(inputs.poEmailInput!.disabled).toBe(true);
    expect(inputs.poIdirInput.disabled).toBe(true);
    expect(inputs.techContactEmailInput!.disabled).toBe(false);
    expect(inputs.techContactIdirInput.disabled).toBe(true);
    expect(inputs.secondTechContactEmailInput!.disabled).toBe(false);
    expect(inputs.secondTechContactIdirInput.disabled).toBe(true);

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
    const { container } = render(<EditPage realm={testRealm} />);

    const inputs = await getFormInputs(container);

    expect(inputs.realmNameInput.disabled).toBe(true);
    expect(inputs.productNameInput.disabled).toBe(false);
    expect(inputs.ministryInput.disabled).toBe(false);
    expect(inputs.divisionInput.disabled).toBe(false);
    expect(inputs.branchInput.disabled).toBe(false);
    expect(inputs.realmPurposeInput.disabled).toBe(false);
    expect(inputs.primaryEndUserInput.disabled).toBe(false);
    expect(inputs.poEmailInput!.disabled).toBe(false);
    expect(inputs.poIdirInput.disabled).toBe(true);
    expect(inputs.techContactEmailInput!.disabled).toBe(false);
    expect(inputs.techContactIdirInput.disabled).toBe(true);
    expect(inputs.secondTechContactEmailInput!.disabled).toBe(false);
    expect(inputs.secondTechContactIdirInput.disabled).toBe(true);

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
    const { container } = render(<EditPage realm={testRealm} />);

    const inputs = await getFormInputs(container);

    expect(inputs.realmNameInput.disabled).toBe(true);
    expect(inputs.productNameInput.disabled).toBe(false);
    expect(inputs.ministryInput.disabled).toBe(false);
    expect(inputs.divisionInput.disabled).toBe(false);
    expect(inputs.branchInput.disabled).toBe(false);
    expect(inputs.realmPurposeInput.disabled).toBe(false);
    expect(inputs.primaryEndUserInput.disabled).toBe(false);
    expect(inputs.poEmailInput!.disabled).toBe(false);
    expect(inputs.poIdirInput.disabled).toBe(true);
    expect(inputs.techContactEmailInput!.disabled).toBe(false);
    expect(inputs.techContactIdirInput.disabled).toBe(true);
    expect(inputs.secondTechContactEmailInput!.disabled).toBe(false);
    expect(inputs.secondTechContactIdirInput.disabled).toBe(true);

    expect(screen.queryByTestId('rc-channel-input', { exact: false })).not.toBeNull();
    expect(screen.queryByTestId('rc-channel-owner-input', { exact: false })).not.toBeNull();
    expect(screen.queryByLabelText('Material To Send', { exact: false })).not.toBeNull();
  });
});
