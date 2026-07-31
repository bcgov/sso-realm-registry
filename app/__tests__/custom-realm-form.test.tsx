import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import CustomRealmForm from 'pages/custom-realm-form';
import { submitRealmRequest } from 'services/realm';
import { AzureUser, CustomRealmFormData } from 'types/realm-profile';
import { getBranches, getDivisions, getMinistries } from 'services/meta';

const buildAzureUser = (name: string, id: string, samAccountName: string): AzureUser => ({
  businessPhones: ['1234567890'],
  displayName: name,
  givenName: name,
  jobTitle: 'Automation Tester',
  mail: `${samAccountName.toLowerCase()}@gov.bc.ca`,
  mobilePhone: '',
  officeLocation: '',
  preferredLanguage: '',
  surname: 'User',
  userPrincipalName: '',
  id,
  onPremisesSamAccountName: samAccountName,
});

const testAzureUsers = [
  buildAzureUser('Ada Owner', 'azure-id-owner', 'AOWNER'),
  buildAzureUser('Ben Lead', 'azure-id-lead', 'BLEAD'),
  buildAzureUser('Cara Extra', 'azure-id-extra', 'CEXTRA'),
];

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
  };
});

// The search returns the IDIR username, so a selection needs no second round trip.
jest.mock('services/azure', () => {
  return {
    getIdirUsersByEmail: jest.fn((email: string) => Promise.resolve([testAzureUsers, null])),
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
    user: { username: 'admin' },
  };
  return {
    __esModule: true,
    ...originalModule,
    useSession: jest.fn(() => {
      return { data: mockSession, status: 'authenticated' }; // return type is [] in v3 but changed to {} in v4
    }),
  };
});

const memberPayload = (user: AzureUser) => ({
  azureId: user.id,
  email: user.mail,
  idirUsername: user.onPremisesSamAccountName,
});

describe('Form Validation', () => {
  // realm, product name, purpose, primary end users, product owner, technical lead.
  // The IDIR inputs are read only echoes of the picker, so they no longer validate.
  const requiredFieldCount = 6;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const submitForm = () => {
    const submitButon = screen.getByText('Submit', { selector: 'button' });
    fireEvent.click(submitButon);
  };

  const getErrorCount = (container: HTMLElement) => {
    const errorText = container.querySelectorAll('.error-message');
    return Array.from(errorText).length;
  };

  const fillTextInput = (label: string, value = 'a', exact: boolean = false) => {
    const field = screen.getByLabelText(label, { exact });
    fireEvent.change(field, { target: { value } });
  };

  /** Picks the nth directory result out of an async select. */
  const fillSelectField = async (classSelector: string, container: HTMLElement, optionIndex = 0) => {
    const field = container.querySelector(`input.${classSelector}__input`);
    fireEvent.input(field!, { target: { value: 'user' } });
    await waitFor(() => {
      const options = container.querySelectorAll(`.${classSelector}__option`);
      expect(options.length).toBeGreaterThan(optionIndex);
      fireEvent.click(options[optionIndex]);
    });
  };

  const clickInput = (label: string) => {
    const field = screen.getByLabelText(label);
    fireEvent.click(field);
  };

  const fillRequiredFields = async (container: HTMLElement) => {
    fillTextInput('Custom Realm name', 'name');
    fillTextInput('Purpose of Realm', 'purpose');
    fillTextInput('Product Name', 'name');
    clickInput('People living in BC');
    await fillSelectField('product-owner-email', container, 0);
    await fillSelectField('technical-contact-email', container, 1);
  };

  it('Shows validation messages for incomplete fields and does not make api request', () => {
    const { container } = render(<CustomRealmForm />);
    submitForm();

    const errorCount = getErrorCount(container);
    expect(errorCount).toBe(requiredFieldCount);
    expect(submitRealmRequest).not.toHaveBeenCalled();
  });

  it('Clears out validation messages as fields are completed', async () => {
    // Trigger all errors
    const { container } = render(<CustomRealmForm />);

    submitForm();
    fillTextInput('Custom Realm name');
    expect(getErrorCount(container)).toBe(requiredFieldCount - 1);

    fillTextInput('Purpose of Realm');
    expect(getErrorCount(container)).toBe(requiredFieldCount - 2);

    // Primary users section
    clickInput('People living in BC');
    expect(getErrorCount(container)).toBe(requiredFieldCount - 3);

    await fillSelectField('product-owner-email', container, 0);
    expect(getErrorCount(container)).toBe(requiredFieldCount - 4);

    await fillSelectField('technical-contact-email', container, 1);
    expect(getErrorCount(container)).toBe(requiredFieldCount - 5);

    fillTextInput('Product Name', 'aa', true);
    expect(getErrorCount(container)).toBe(requiredFieldCount - 6);
  });

  it('Sends the azure object id for each member', async () => {
    const { container } = render(<CustomRealmForm />);
    await fillRequiredFields(container);

    await act(async () => {
      submitForm();
    });

    expect(submitRealmRequest).toHaveBeenCalledWith({
      primaryEndUsers: ['livingInBC'],
      productName: 'name',
      realm: 'name',
      purpose: 'purpose',
      productOwner: memberPayload(testAzureUsers[0]),
      technicalLead: memberPayload(testAzureUsers[1]),
      additionalUsers: [],
    });
  });

  it('Shows the IDIR username read only alongside each picker', async () => {
    const { container } = render(<CustomRealmForm />);
    await fillRequiredFields(container);

    const poIdir = screen.getByTestId('product-owner-idir') as HTMLInputElement;
    const tlIdir = screen.getByTestId('tech-contact-idir') as HTMLInputElement;

    expect(poIdir.value).toBe('AOWNER');
    expect(poIdir.readOnly).toBe(true);
    expect(tlIdir.value).toBe('BLEAD');
    expect(tlIdir.readOnly).toBe(true);
  });

  it('Adds and removes additional user rows', async () => {
    const { container } = render(<CustomRealmForm />);
    await fillRequiredFields(container);

    fireEvent.click(screen.getByText('Add user', { selector: 'button' }));
    await fillSelectField('additional-user-email', container, 2);

    await act(async () => {
      submitForm();
    });

    expect((submitRealmRequest as jest.Mock).mock.calls[0][0].additionalUsers).toEqual([
      memberPayload(testAzureUsers[2]),
    ]);

    fireEvent.click(screen.getByLabelText('Remove additional user 1'));

    await act(async () => {
      submitForm();
    });

    expect((submitRealmRequest as jest.Mock).mock.calls[1][0].additionalUsers).toEqual([]);
  });

  it('Rejects additional user rows that were never filled in', async () => {
    const { container } = render(<CustomRealmForm />);
    await fillRequiredFields(container);

    fireEvent.click(screen.getByText('Add user', { selector: 'button' }));

    await act(async () => {
      submitForm();
    });

    expect(getErrorCount(container)).toBe(1);
    expect(submitRealmRequest).not.toHaveBeenCalled();

    // Removing the row is how the requester says they did not mean to add anybody.
    fireEvent.click(screen.getByLabelText('Remove additional user 1'));

    await act(async () => {
      submitForm();
    });

    expect((submitRealmRequest as jest.Mock).mock.calls[0][0].additionalUsers).toEqual([]);
  });

  it('Flags only the blank row when other rows are filled in', async () => {
    const { container } = render(<CustomRealmForm />);
    await fillRequiredFields(container);

    fireEvent.click(screen.getByText('Add user', { selector: 'button' }));
    await fillSelectField('additional-user-email', container, 2);
    fireEvent.click(screen.getByText('Add user', { selector: 'button' }));

    await act(async () => {
      submitForm();
    });

    expect(submitRealmRequest).not.toHaveBeenCalled();
    const rowErrors = container.querySelectorAll('.additional-user-email-1 ~ .error-message');
    expect(container.querySelectorAll('.error-message').length).toBe(1);
    expect(rowErrors.length).toBe(1);
  });

  it('Caps the additional users at ten', () => {
    render(<CustomRealmForm />);
    const addButton = screen.getByText('Add user', { selector: 'button' }) as HTMLButtonElement;

    for (let i = 0; i < 10; i += 1) fireEvent.click(addButton);

    expect(screen.getAllByText(/Additional user \d+'s email/).length).toBe(10);
    expect(addButton.disabled).toBe(true);
  });

  it('Rejects the same person in more than one slot', async () => {
    const { container } = render(<CustomRealmForm />);
    await fillRequiredFields(container);

    fireEvent.click(screen.getByText('Add user', { selector: 'button' }));
    // The same account already holds the product owner slot.
    await fillSelectField('additional-user-email', container, 0);

    await act(async () => {
      submitForm();
    });

    await waitFor(() => screen.getByText(/cannot occupy more than one membership slot/));
    expect(submitRealmRequest).not.toHaveBeenCalled();
  });

  it('Reports a duplicate against the slot that has to change', async () => {
    const { container } = render(<CustomRealmForm />);
    fillTextInput('Custom Realm name', 'name');
    fillTextInput('Purpose of Realm', 'purpose');
    fillTextInput('Product Name', 'name');
    clickInput('People living in BC');
    // The same account in both slots, so the technical lead is the one to fix.
    await fillSelectField('product-owner-email', container, 0);
    await fillSelectField('technical-contact-email', container, 0);

    await act(async () => {
      submitForm();
    });

    const techLeadError = container
      .querySelector('.technical-contact-email')
      ?.closest('.input-wrapper')
      ?.querySelector('.error-message');
    expect(techLeadError?.textContent).toMatch(/cannot occupy more than one membership slot/);
    expect(getErrorCount(container)).toBe(1);
    expect(submitRealmRequest).not.toHaveBeenCalled();
  });
});

describe('Ministry Fetching', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  it('Fetches ministry list when first loading', () => {
    render(<CustomRealmForm />);
    expect(getMinistries).toHaveBeenCalledTimes(1);
  });

  it('Fetches division list only when new ministries are selected', () => {
    render(<CustomRealmForm />);
    expect(getDivisions).toHaveBeenCalledTimes(0);

    const ministryInput = screen.getByLabelText('Ministry');
    fireEvent.change(ministryInput, { target: { value: 'Ministry of Truth' } });
    fireEvent.blur(ministryInput);
    expect(getDivisions).toHaveBeenCalledTimes(1);
  });

  it('Fetches branch list only when new divisions are selected', () => {
    render(<CustomRealmForm />);

    // Branches only fetched if division is entered
    const ministryInput = screen.getByLabelText('Ministry');
    fireEvent.change(ministryInput, { target: { value: 'Ministry of Truth' } });
    fireEvent.blur(ministryInput);
    expect(getBranches).toHaveBeenCalledTimes(0);

    const divisionInput = screen.getByLabelText('Division');
    fireEvent.change(divisionInput, { target: { value: 'Division of Plenty' } });
    fireEvent.blur(divisionInput);
    expect(getBranches).toHaveBeenCalledTimes(1);
  });
});
