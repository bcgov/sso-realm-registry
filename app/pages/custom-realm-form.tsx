import React, { useState, useRef, ChangeEvent, useContext } from 'react';
import Head from 'next/head';
import { Grid as SpinnerGrid } from 'react-loader-spinner';
import styled from 'styled-components';
import Button from '@button-inc/bcgov-theme/Button';
import { submitRealmRequest } from 'services/realm';
import { CustomRealmFormData } from 'types/realm-profile';
import { withBottomAlert, BottomAlert } from 'layout/BottomAlert';
import { useSession, signIn } from 'next-auth/react';
import { useRouter } from 'next/router';
import { ModalContext } from 'context/modal';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faInfoCircle } from '@fortawesome/free-solid-svg-icons';
import { createRealmSchema } from 'validators/create-realm';
import { ValidationError } from 'yup';
import cloneDeep from 'lodash.clonedeep';

const SForm = styled.form`
  display: grid;
  grid-template-columns: 1fr 1fr;
  column-gap: 2em;
  row-gap: 1em;
  padding: 2em;

  .error-message {
    color: red;
    font-size: 0.8em;
    padding: 0;
    margin: 0;
  }

  .first-col {
    grid-column: 1;
  }

  .second-col {
    grid-column: 2;
  }

  .span-cols {
    grid-column: 1 / 3;
  }

  label,
  legend {
    &.required:after {
      content: ' *';
    }

    &.with-info svg {
      margin: 0 0.3em;
    }
  }
  fieldset {
    border: 0;
    legend {
      font-size: 1em;
      margin-bottom: 0;
    }
  }

  .input-wrapper {
    display: flex;
    flex-direction: column;
  }

  .checkbox-wrapper,
  .radio-wrapper {
    input {
      margin-right: 0.5em;
    }
  }

  .checkbox-wrapper.with-textarea {
    display: flex;
    flex-direction: row;
    align-items: flex-start;
    justify-content: space-between;

    input {
      margin-top: 0.4em;
    }

    .textarea-container {
      margin-left: 1em;
      flex: 1;
      textarea {
        width: 100%;
      }

      .help-text {
        color: grey;
        text-align: right;
        margin: 0;
      }
    }
  }

  .grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    column-gap: 2em;
    row-gap: 1em;
  }
`;

const ButtonContainer = styled.div`
  padding: 0 2em;
  width: 100%;
  display: flex;
  justify-content: space-between;
  button {
    width: 8em;
  }
`;

const defaultData: CustomRealmFormData = {
  status: 'pending',
  realm: '',
  purpose: '',
  primaryEndUsers: [],
  environments: [],
  productOwnerEmail: '',
  productOwnerIdirUserId: '',
  technicalContactEmail: '',
  technicalContactIdirUserId: '',
  secondTechnicalContactIdirUserId: '',
  secondTechnicalContactEmail: '',
};

const validateForm = (data: CustomRealmFormData) => {
  try {
    createRealmSchema.validateSync(data, { abortEarly: false, stripUnknown: true });
    return { valid: true, errors: null };
  } catch (e) {
    const err = e as ValidationError;
    const formErrors: { [key in keyof CustomRealmFormData]?: boolean } = {};
    err.errors.forEach((error) => {
      // Yup error strings begin with object key
      const fieldName = error.split(' ')[0] as keyof CustomRealmFormData;
      formErrors[fieldName] = true;
    });
    return { valid: false, errors: formErrors };
  }
};

interface Props {
  alert: BottomAlert;
}

function RealmForm({ alert }: Props) {
  const formRef = useRef<null | HTMLFormElement>(null);
  const [formData, setFormData] = useState<CustomRealmFormData>(defaultData);
  const [formErrors, setFormErrors] = useState<{ [key in keyof CustomRealmFormData]?: boolean }>({});
  const [submittingForm, setSubmittingForm] = useState(false);
  const { setModalConfig } = useContext(ModalContext);
  const router = useRouter();

  const [otherPrimaryEndUsersSelected, setOtherPrimaryEndUsersSelected] = useState(false);
  const [otherPrimaryEndUserDetails, setOtherPrimaryEndUserDetails] = useState('');

  // Redirect if not authenticated/loading
  const { status } = useSession();
  if (!['loading', 'authenticated'].includes(status)) {
    signIn('keycloak', {
      callbackUrl: '/custom-realm-form',
    });
    return null;
  }

  const requiredMessage = 'Fill in the required fields.';
  const requiredEmailMessage = 'Fill this in with a proper email.';
  const twoCharactersRequiredMessage = 'This field must be at least two characters.';

  const handleSubmit = async () => {
    const submission = cloneDeep(formData);
    const { valid, errors } = validateForm(submission);
    if (!valid) {
      setFormErrors(errors as any);
      return;
    }
    setSubmittingForm(true);

    // Add other primary users if present
    if (otherPrimaryEndUsersSelected) {
      submission.primaryEndUsers.push(otherPrimaryEndUserDetails);
    }
    const [response, err] = await submitRealmRequest(submission);
    if (err) {
      const content = err?.response?.data?.error || 'Network request failure. Please try again.';
      alert.show({
        variant: 'danger',
        fadeOut: 10000,
        closable: true,
        content,
      });
    } else {
      router.push('/').then(() => {
        setModalConfig({
          title: 'Custom Realm request submitted',
          body: `We have received your request for a Custom Realm (ID ${response.id}). Please be assured that someone from our team will look into your request and will reach out soon.`,
          show: true,
        });
      });
    }
    setSubmittingForm(false);
  };

  // Change handlers
  const handleFormInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    setFormErrors({ ...formErrors, [e.target.name]: false });
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleFormCheckboxGroupChange = (
    e: ChangeEvent<HTMLInputElement>,
    groupName: 'environments' | 'primaryEndUsers',
  ) => {
    setFormErrors({ ...formErrors, [groupName]: false });
    let newData = { ...formData };
    if (e.target.checked && !formData[groupName].includes(e.target.value)) {
      newData = { ...formData, [groupName]: [...formData[groupName], e.target.name] };
    } else {
      newData = { ...formData, [groupName]: formData[groupName].filter((val) => val !== e.target.name) };
    }
    setFormData(newData);
  };

  return (
    <>
      <Head>
        <title>Custom Realm</title>
      </Head>
      <SForm ref={formRef}>
        <h1>Request a Custom Realm</h1>

        <div className="input-wrapper first-col">
          <label htmlFor="realm-name-input" className="required with-info">
            1. Custom Realm name
            <FontAwesomeIcon icon={faInfoCircle} title="Select a unique realm name." color="#777777" />
          </label>
          <input required id="realm-name-input" name="realm" onChange={handleFormInputChange} value={formData.realm} />
          {formErrors.realm && <p className="error-message">{twoCharactersRequiredMessage}</p>}
        </div>

        <div className="input-wrapper second-col">
          <label htmlFor="realm-purpose-input" className="required with-info">
            2. Purpose of Realm
            <FontAwesomeIcon icon={faInfoCircle} title="What is this relams purpose?" color="#777777" />
          </label>
          <input
            required
            id="realm-purpose-input"
            name="purpose"
            onChange={handleFormInputChange}
            value={formData.purpose}
          />
          {formErrors.purpose && <p className="error-message">{twoCharactersRequiredMessage}</p>}
        </div>

        <fieldset className="span-cols">
          <legend className="required">
            3. Who are the primary end users of your project/application? (select all that apply)
          </legend>
          {formErrors.primaryEndUsers && <p className="error-message">You must select one or more.</p>}
          <div className="grid">
            <div className="checkbox-wrapper">
              <input
                type="checkbox"
                id="living-in-bc-checkbox"
                name="livingInBC"
                onChange={(e) => handleFormCheckboxGroupChange(e, 'primaryEndUsers')}
                checked={formData.primaryEndUsers.includes('livingInBC')}
              />
              <label htmlFor="living-in-bc-checkbox">People living in BC</label>
            </div>

            <div className="checkbox-wrapper">
              <input
                type="checkbox"
                id="people-doing-business-checkbox"
                name="businessInBC"
                onChange={(e) => handleFormCheckboxGroupChange(e, 'primaryEndUsers')}
                checked={formData.primaryEndUsers.includes('businessInBC')}
              />
              <label htmlFor="people-doing-business-checkbox">People doing business/travel in BC</label>
            </div>

            <div className="checkbox-wrapper">
              <input
                type="checkbox"
                id="bc-gov-employees-checkbox"
                name="govEmployees"
                onChange={(e) => handleFormCheckboxGroupChange(e, 'primaryEndUsers')}
                checked={formData.primaryEndUsers.includes('govEmployees')}
              />
              <label htmlFor="bc-gov-employees-checkbox">BC Gov employees</label>
            </div>

            <div className="checkbox-wrapper with-textarea">
              <input
                type="checkbox"
                id="other-users-checkbox"
                name="other"
                onChange={(e) => {
                  setOtherPrimaryEndUsersSelected(!otherPrimaryEndUsersSelected);
                  if (!e.target.checked) setOtherPrimaryEndUserDetails('');
                }}
                checked={otherPrimaryEndUsersSelected}
              />
              <label htmlFor="other-users-checkbox">Other</label>
              <div className="textarea-container">
                <textarea
                  rows={3}
                  placeholder="Enter details"
                  name="otherDetails"
                  onChange={(e) => setOtherPrimaryEndUserDetails(e.target.value)}
                  disabled={!otherPrimaryEndUsersSelected}
                  value={otherPrimaryEndUserDetails}
                  maxLength={100}
                />
                <p className="help-text">100 Characters max.</p>
              </div>
            </div>
          </div>
        </fieldset>

        <fieldset className="span-cols">
          <legend className="required">4. Select all applicable environments</legend>
          {formErrors.environments && <p className="error-message">You must select one or more.</p>}
          <div className="grid">
            <div className="checkbox-wrapper">
              <input
                type="checkbox"
                id="dev-env-checkbox"
                name="dev"
                onChange={(e) => handleFormCheckboxGroupChange(e, 'environments')}
                checked={formData.environments.includes('dev')}
              />
              <label htmlFor="dev-env-checkbox">Development</label>
            </div>

            <div className="checkbox-wrapper">
              <input
                type="checkbox"
                id="test-env-checkbox"
                name="test"
                onChange={(e) => handleFormCheckboxGroupChange(e, 'environments')}
                checked={formData.environments.includes('test')}
              />
              <label htmlFor="test-env-checkbox">Test</label>
            </div>

            <div className="checkbox-wrapper">
              <input
                type="checkbox"
                id="prod-env-checkbox"
                name="prod"
                onChange={(e) => handleFormCheckboxGroupChange(e, 'environments')}
                checked={formData.environments.includes('prod')}
              />
              <label htmlFor="prod-env-checkbox">Prod</label>
            </div>
          </div>
        </fieldset>

        <div className="input-wrapper first-col">
          <label htmlFor="product-owner-email-input" className="required">
            5. Product owner&apos;s email
          </label>
          <input
            required
            id="product-owner-email-input"
            name="productOwnerEmail"
            value={formData.productOwnerEmail}
            onChange={handleFormInputChange}
          />
          {formErrors.productOwnerEmail && <p className="error-message">{requiredEmailMessage}</p>}
        </div>

        <div className="input-wrapper second-col">
          <label htmlFor="product-owner-idir-input" className="required">
            6. Product owner&apos;s IDIR
          </label>
          <input
            required
            id="product-owner-idir-input"
            name="productOwnerIdirUserId"
            value={formData.productOwnerIdirUserId}
            onChange={handleFormInputChange}
          />
          {formErrors.productOwnerIdirUserId && <p className="error-message">{twoCharactersRequiredMessage}</p>}
        </div>

        <div className="input-wrapper first-col">
          <label htmlFor="technical-contact-email-input" className="required">
            7. Technical contact&apos;s email
          </label>
          <input
            required
            id="technical-contact-email-input"
            name="technicalContactEmail"
            value={formData.technicalContactEmail}
            onChange={handleFormInputChange}
          />
          {formErrors.technicalContactEmail && <p className="error-message">{requiredEmailMessage}</p>}
        </div>

        <div className="input-wrapper second-col">
          <label htmlFor="technical-contact-idir-input" className="required">
            8. Technical contact&apos;s IDIR
          </label>
          <input
            required
            id="technical-contact-idir-input"
            name="technicalContactIdirUserId"
            value={formData.technicalContactIdirUserId}
            onChange={handleFormInputChange}
          />
          {formErrors.technicalContactIdirUserId && <p className="error-message">{twoCharactersRequiredMessage}</p>}
        </div>

        <div className="input-wrapper first-col">
          <label htmlFor="secondary-contact-email-input">9. Secondary technical contact&apos;s email</label>
          <input
            required
            id="secondary-contact-email-input"
            name="secondTechnicalContactEmail"
            value={formData.secondTechnicalContactEmail}
            onChange={handleFormInputChange}
          />
          {formErrors.secondTechnicalContactEmail && <p className="error-message">{requiredEmailMessage}</p>}
        </div>

        <div className="input-wrapper second-col">
          <label htmlFor="secondary-contact-idir-input">10. Secondary technical contact&apos;s IDIR</label>
          <input
            required
            id="secondary-contact-idir-input"
            name="secondTechnicalContactIdirUserId"
            value={formData.secondTechnicalContactIdirUserId}
            onChange={handleFormInputChange}
          />
          {formErrors.secondTechnicalContactIdirUserId && <p className="error-message">{requiredMessage}</p>}
        </div>
      </SForm>
      <ButtonContainer className="button-container">
        <Button variant="secondary">Cancel</Button>
        <Button onClick={handleSubmit} disabled={submittingForm}>
          {submittingForm ? <SpinnerGrid color="#fff" height={15} width={15} wrapperClass="d-block" /> : 'Submit'}
        </Button>
      </ButtonContainer>
    </>
  );
}

export default withBottomAlert(RealmForm);
