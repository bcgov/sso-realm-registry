import React from "react";
import { render, screen, fireEvent, findByText } from "@testing-library/react";
import CustomRealmForm from 'pages/custom-realm-form';
import { prettyDOM } from '@testing-library/dom';
import { useSession } from "next-auth/react";
import userEvent from '@testing-library/user-event';
import { submitRealmRequest } from 'services/realm'
import { CustomRealmFormData } from "types/realm-profile";
import { act } from "react-dom/test-utils";

jest.mock('services/realm', () => {
  return {
    submitRealmRequest: jest.fn((realmInfo: CustomRealmFormData) => Promise.resolve([true, null]))
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

describe('Form Validation', () => {
  const requiredFieldCount = 11;

  const submitForm = () => {
    const submitButon = screen.getByText("Submit", { selector: 'button' });
    fireEvent.click(submitButon)
  }

  const getErrorCount = (container: HTMLElement) => {
    const errorText = container.querySelectorAll('.error-message');
    return Array.from(errorText).length
  }

  const fillTextInput = (label: string, value = 'a') => {
    const field = screen.getByLabelText(label);
    fireEvent.change(field, { target: { value } })
  }

  const clickInput = (label: string) => {
    const field = screen.getByLabelText(label);
    fireEvent.click(field)
  }

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
    fillTextInput('1. Custom Realm name')
    expect(getErrorCount(container)).toBe(requiredFieldCount - 1);

    fillTextInput('2. Purpose of Realm')
    expect(getErrorCount(container)).toBe(requiredFieldCount - 2);

    // Primary users section
    clickInput('People living in BC')
    expect(getErrorCount(container)).toBe(requiredFieldCount - 3);

    // Environments section
    clickInput('Development')
    expect(getErrorCount(container)).toBe(requiredFieldCount - 4);

    clickInput('IDIR')
    expect(getErrorCount(container)).toBe(requiredFieldCount - 5);

    fillTextInput('6. Product owner\'s email')
    expect(getErrorCount(container)).toBe(requiredFieldCount - 6);

    fillTextInput('7. Product owner\'s IDIR')
    expect(getErrorCount(container)).toBe(requiredFieldCount - 7);

    fillTextInput('8. Technical contact\'s email')
    expect(getErrorCount(container)).toBe(requiredFieldCount - 8);

    fillTextInput('9. Technical contact\'s IDIR')
    expect(getErrorCount(container)).toBe(requiredFieldCount - 9);

    fillTextInput('10. Secondary technical contact\'s email')
    expect(getErrorCount(container)).toBe(requiredFieldCount - 10);

    fillTextInput('11. Secondary technical contact\'s IDIR')
    expect(getErrorCount(container)).toBe(requiredFieldCount - 11);
  })

  it('Sends off the expected form data when a proper submission is made', async () => {
    render(<CustomRealmForm />);
    fillTextInput('1. Custom Realm name', 'name')
    fillTextInput('2. Purpose of Realm', 'purpose')
    clickInput('People living in BC')
    clickInput('Development')
    clickInput('IDIR')
    fillTextInput('6. Product owner\'s email', 'po@gmail.com')
    fillTextInput('7. Product owner\'s IDIR', 'poidir')
    fillTextInput('8. Technical contact\'s email', 'tc@gmail.com')
    fillTextInput('9. Technical contact\'s IDIR', 'tcidir')
    fillTextInput('10. Secondary technical contact\'s email', 'stc@gmail.com')
    fillTextInput('11. Secondary technical contact\'s IDIR', 'stcidir')

    await act(async () => {
      submitForm()
    })

    expect(submitRealmRequest).toHaveBeenCalledWith({
      "environments": {
        "dev": true,
        "prod": false,
        "test": false,
      },
      "loginIdp": "idir",
      "primaryUsers": {
        "businessInBC": false,
        "govEmployees": false,
        "livingInBC": true,
        "other": false,
        "otherDetails": "",
      },
      "productOwnerEmail": "po@gmail.com",
      "productOwnerIdir": "poidir",
      "realmName": "name",
      "realmPurpose": "purpose",
      "secondaryTechnicalContactEmail": "stc@gmail.com",
      "secondaryTechnicalContactIdir": "stcidir",
      "status": "pending",
      "technicalContactEmail": "tc@gmail.com",
      "technicalContactIdir": "tcidir",
    })
  })

  // it('Shows the user an error message if network request fails', async () => {
  //   const { container } = render(<CustomRealmForm />);
  //   (submitRealmRequest as jest.MockedFunction<any>).mockImplementationOnce(
  //     () => Promise.resolve([null, {message: 'failure'}])
  //   )
  //   fillTextInput('1. Custom Realm name', 'name')
  //   fillTextInput('2. Purpose of Realm', 'purpose')
  //   clickInput('People living in BC')
  //   clickInput('Development')
  //   clickInput('IDIR')
  //   fillTextInput('6. Product owner\'s email', 'po@gmail.com')
  //   fillTextInput('7. Product owner\'s IDIR', 'poidir')
  //   fillTextInput('8. Technical contact\'s email', 'tc@gmail.com')
  //   fillTextInput('9. Technical contact\'s IDIR', 'tcidir')
  //   fillTextInput('10. Secondary technical contact\'s email', 'stc@gmail.com')
  //   fillTextInput('11. Secondary technical contact\'s IDIR', 'stcidir')

  //   await act(async () => {
  //     submitForm()
  //   })

  //   const thingy = document.querySelector('.pg-notification')
  //   console.log(thingy)
  // })
})  