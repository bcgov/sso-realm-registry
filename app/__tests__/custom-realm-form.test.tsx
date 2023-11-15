import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import CustomRealmForm from 'pages/custom-realm-form';
import { submitRealmRequest } from 'services/realm';
import { CustomRealmFormData } from 'types/realm-profile';
import { act } from 'react-dom/test-utils';

jest.mock('services/realm', () => {
  return {
    submitRealmRequest: jest.fn((realmInfo: CustomRealmFormData) => Promise.resolve([true, null])),
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

describe('Form Validation', () => {
  const requiredFieldCount = 8;

  const submitForm = () => {
    const submitButon = screen.getByText('Submit', { selector: 'button' });
    fireEvent.click(submitButon);
  };

  const getErrorCount = (container: HTMLElement) => {
    const errorText = container.querySelectorAll('.error-message');
    return Array.from(errorText).length;
  };

  const fillTextInput = (label: string, value = 'a') => {
    const field = screen.getByLabelText(label, { exact: false });
    fireEvent.change(field, { target: { value } });
  };

  const clickInput = (label: string) => {
    const field = screen.getByLabelText(label);
    fireEvent.click(field);
  };

  it('Shows validation messages for incomplete fields and does not make api request', () => {
    const { container } = render(<CustomRealmForm />);
    submitForm();

    const errorCount = getErrorCount(container);
    expect(errorCount).toBe(requiredFieldCount);
    expect(submitRealmRequest).not.toHaveBeenCalled();
  });

  it('Clears out validation messages as fields are completed', () => {
    // Trigger all errors
    const { container } = render(<CustomRealmForm />);
    submitForm();
    fillTextInput('1. Custom Realm name');
    expect(getErrorCount(container)).toBe(requiredFieldCount - 1);

    fillTextInput('2. Purpose of Realm');
    expect(getErrorCount(container)).toBe(requiredFieldCount - 2);

    // Primary users section
    clickInput('People living in BC');
    expect(getErrorCount(container)).toBe(requiredFieldCount - 3);

    // Environments section
    clickInput('Development');
    expect(getErrorCount(container)).toBe(requiredFieldCount - 4);

    fillTextInput("5. Product owner's email");
    expect(getErrorCount(container)).toBe(requiredFieldCount - 5);

    fillTextInput("6. Product owner's IDIR");
    expect(getErrorCount(container)).toBe(requiredFieldCount - 6);

    fillTextInput("7. Technical contact's email");
    expect(getErrorCount(container)).toBe(requiredFieldCount - 7);

    fillTextInput("8. Technical contact's IDIR");
    expect(getErrorCount(container)).toBe(requiredFieldCount - 8);
  });

  it('Sends off the expected form data when a proper submission is made', async () => {
    render(<CustomRealmForm />);
    fillTextInput('1. Custom Realm name', 'name');
    fillTextInput('2. Purpose of Realm', 'purpose');
    clickInput('People living in BC');
    clickInput('Development');
    fillTextInput("5. Product owner's email", 'po@gmail.com');
    fillTextInput("6. Product owner's IDIR", 'poidir');
    fillTextInput("7. Technical contact's email", 'tc@gmail.com');
    fillTextInput("8. Technical contact's IDIR", 'tcidir');
    fillTextInput("9. Secondary technical contact's email", 'stc@gmail.com');
    fillTextInput("10. Secondary technical contact's IDIR", 'stcidir');

    await act(async () => {
      submitForm();
    });

    expect(submitRealmRequest).toHaveBeenCalledWith({
      environments: ['dev'],
      primaryEndUsers: ['livingInBC'],
      productOwnerEmail: 'po@gmail.com',
      productOwnerIdirUserId: 'poidir',
      realm: 'name',
      purpose: 'purpose',
      secondTechnicalContactEmail: 'stc@gmail.com',
      secondTechnicalContactIdirUserId: 'stcidir',
      status: 'pending',
      technicalContactEmail: 'tc@gmail.com',
      technicalContactIdirUserId: 'tcidir',
    });
  });
});
