import React from 'react';
import { render, screen } from '@testing-library/react';
import EditPage, { getServerSideProps } from 'pages/realm/[rid]';
import { CustomRealmFormData } from 'types/realm-profile';
import { CustomRealmProfiles, buildMembers, serializedMembers } from './fixtures';
import prisma from 'utils/prisma';
import { getServerSession } from 'next-auth';
import { RoleEnum } from 'utils/helpers';
import { MemberRoleEnum } from 'utils/constants';
import { getRealmMembers, getUserRoleOnRealm } from 'controllers/user-access';

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

jest.mock('services/azure', () => {
  return {
    getIdirUsersByEmail: jest.fn(() => Promise.resolve([[], null])),
  };
});

// Keeps the admin client's ESM out of jest; this page only reads membership.
jest.mock('../controllers/keycloak', () => {
  return {
    syncUserAccess: jest.fn(),
  };
});

const members = buildMembers();

jest.mock('../controllers/user-access', () => {
  const actual = jest.requireActual('../controllers/user-access');
  return {
    ...actual,
    getUserRoleOnRealm: jest.fn(),
    getRealmMembers: jest.fn(() => Promise.resolve(members)),
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

jest.mock('utils/prisma', () => {
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
  productOwner: null,
  technicalLead: null,
  additionalUsers: [],
  members: serializedMembers(members),
};

const mockSessionAs = (overrides: any) =>
  (getServerSession as jest.Mock).mockImplementation(() => ({
    user: { idir_username: MOCK_IDIR, ...overrides },
  }));

describe('Server Fetching', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.roster.findFirst as jest.Mock).mockImplementation(() => Promise.resolve({ id: 1, realm: 'realm 1' }));
    (getRealmMembers as jest.Mock).mockImplementation(() => Promise.resolve(members));
    mockSessionAs({});
  });

  it('Requires a non-admin to hold membership on the realm', async () => {
    (getUserRoleOnRealm as jest.Mock).mockImplementation(() => Promise.resolve(null));

    const result: any = await getServerSideProps({ params: { rid: 1 } } as any);

    expect(getUserRoleOnRealm).toHaveBeenCalledWith(1, MOCK_IDIR);
    expect(result.props.realm).toBeNull();
  });

  it('Keeps additional users out of the edit page, since they are view only', async () => {
    (getUserRoleOnRealm as jest.Mock).mockImplementation(() => Promise.resolve(MemberRoleEnum.ADDITIONAL));

    const result: any = await getServerSideProps({ params: { rid: 1 } } as any);

    expect(result.props.realm).toBeNull();
  });

  it('Lets the product owner and technical lead in, with their own role', async () => {
    (getUserRoleOnRealm as jest.Mock).mockImplementation(() => Promise.resolve(MemberRoleEnum.PRODUCT_OWNER));
    let result: any = await getServerSideProps({ params: { rid: 1 } } as any);
    expect(result.props.realm).not.toBeNull();
    expect(result.props.role).toBe(RoleEnum.PRODUCT_OWNER);

    (getUserRoleOnRealm as jest.Mock).mockImplementation(() => Promise.resolve(MemberRoleEnum.TECHNICAL_LEAD));
    result = await getServerSideProps({ params: { rid: 1 } } as any);
    expect(result.props.realm).not.toBeNull();
    expect(result.props.role).toBe(RoleEnum.TECHNICAL_LEAD);
  });

  it('Allows admins to always see the edit page', async () => {
    mockSessionAs({ client_roles: ['sso-admin'] });

    const result: any = await getServerSideProps({ params: { rid: 1 } } as any);

    // Admins are never membership checked.
    expect(getUserRoleOnRealm).not.toHaveBeenCalled();
    expect(result.props.realm).not.toBeNull();
    expect(result.props.role).toBe(RoleEnum.ADMIN);
  });

  it('Never sends the guid to the client', async () => {
    (getUserRoleOnRealm as jest.Mock).mockImplementation(() => Promise.resolve(MemberRoleEnum.PRODUCT_OWNER));

    const result: any = await getServerSideProps({ params: { rid: 1 } } as any);

    expect(JSON.stringify(result.props)).not.toContain('guid-po');
  });
});

describe('Form Validation', () => {
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
    const poEmailInput = container.querySelector('input.product-owner-email__input') as HTMLInputElement;
    const poIdirInput = (await screen.findByTestId('product-owner-idir')) as HTMLInputElement;
    const techLeadEmailInput = container.querySelector('input.technical-contact-email__input') as HTMLInputElement;
    const techLeadIdirInput = (await screen.findByTestId('tech-contact-idir')) as HTMLInputElement;
    const additionalUsersSection = document.getElementById('additional-users-section') as HTMLFieldSetElement;
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
      techLeadEmailInput,
      techLeadIdirInput,
      additionalUsersSection,
    };
  };

  it("Displays 'not found' when no realm can be retrieved", () => {
    render(<EditPage realm={null} />);
    screen.getByText('Not Found');
  });

  it('Loads the stored membership into the form', async () => {
    render(<EditPage realm={testRealm} role={RoleEnum.PRODUCT_OWNER} />);

    const poIdir = (await screen.findByTestId('product-owner-idir')) as HTMLInputElement;
    const tlIdir = (await screen.findByTestId('tech-contact-idir')) as HTMLInputElement;
    const additionalIdir = (await screen.findByTestId('additional-user-0-idir')) as HTMLInputElement;

    expect(poIdir.value).toBe(members[0].user.idirUsername);
    expect(tlIdir.value).toBe(members[1].user.idirUsername);
    expect(additionalIdir.value).toBe(members[2].user.idirUsername);
  });

  it('Enables/disables expected fields for a technical lead', async () => {
    const { container } = render(<EditPage realm={testRealm} role={RoleEnum.TECHNICAL_LEAD} />);

    const inputs = await getFormInputs(container);

    expect(inputs.realmNameInput.disabled).toBe(true);
    expect(inputs.productNameInput.disabled).toBe(true);
    expect(inputs.ministryInput.disabled).toBe(false);
    expect(inputs.divisionInput.disabled).toBe(false);
    expect(inputs.branchInput.disabled).toBe(false);
    expect(inputs.realmPurposeInput.disabled).toBe(true);
    expect(inputs.primaryEndUserInput.disabled).toBe(true);
    // Membership is symmetric: a technical lead may change any slot.
    expect(inputs.poEmailInput!.disabled).toBe(false);
    expect(inputs.poIdirInput.disabled).toBe(true);
    expect(inputs.techLeadEmailInput!.disabled).toBe(false);
    expect(inputs.techLeadIdirInput.disabled).toBe(true);
    expect(inputs.additionalUsersSection.disabled).toBe(false);

    expect(screen.queryByLabelText('SSO team notes', { exact: false })).toBeNull();
  });

  it('Enables/disables expected fields for a product owner', async () => {
    const { container } = render(<EditPage realm={testRealm} role={RoleEnum.PRODUCT_OWNER} />);

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
    expect(inputs.techLeadEmailInput!.disabled).toBe(false);
    expect(inputs.techLeadIdirInput.disabled).toBe(true);
    expect(inputs.additionalUsersSection.disabled).toBe(false);

    expect(screen.queryByLabelText('SSO team notes', { exact: false })).toBeNull();
  });

  it('Enables/disables expected fields for an admin', async () => {
    const { container } = render(<EditPage realm={testRealm} role={RoleEnum.ADMIN} />);

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
    expect(inputs.techLeadEmailInput!.disabled).toBe(false);
    expect(inputs.techLeadIdirInput.disabled).toBe(true);
    expect(inputs.additionalUsersSection.disabled).toBe(false);

    expect(screen.queryByLabelText('SSO team notes', { exact: false })).not.toBeNull();
  });
});
