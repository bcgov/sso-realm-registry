import { CustomRealmFormData } from 'types/realm-profile';
import styled from 'styled-components';
import React, { useState, ChangeEvent, useEffect } from 'react';
import { Grid as SpinnerGrid } from 'react-loader-spinner';
import Button from '@button-inc/bcgov-theme/Button';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faInfoCircle } from '@fortawesome/free-solid-svg-icons';
import { ValidationError } from 'yup';
import cloneDeep from 'lodash.clonedeep';
import { getMinistries, getDivisions, getBranches } from 'services/meta';
import InfoPopover from 'components/InfoPopover';
import { Ministry } from 'types/realm-profile';
import * as yup from 'yup';

const SForm = styled.form<{ collapse: boolean }>`
  display: grid;
  grid-template-columns: ${(props) => (props.collapse ? '1fr' : '1fr 1fr')};
  column-gap: 2em;
  row-gap: 1em;

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
    grid-column: ${(props) => (props.collapse ? '1' : '2')};
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

  select {
    height: 1.8em;
  }

  .grid {
    display: grid;
    grid-template-columns: ${(props) => (props.collapse ? '1fr' : '1fr 1fr')};
    column-gap: 2em;
    row-gap: 1em;
  }
`;

const ButtonContainer = styled.div`
  width: 100%;
  display: flex;
  justify-content: space-between;
  button {
    width: 8em;
  }
`;

const validateForm = (data: CustomRealmFormData, validationSchema: yup.AnyObjectSchema) => {
  console.log(data);
  try {
    validationSchema.validateSync(data, { abortEarly: false, stripUnknown: true });
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
  formData: CustomRealmFormData;
  setFormData: (data: CustomRealmFormData) => void;
  onSubmit: (data: CustomRealmFormData) => Promise<void>;
  isAdmin?: boolean;
  isPO?: boolean;
  validationSchema: yup.AnyObjectSchema;
  collapse: boolean;
}

const requiredMessage = 'Fill in the required fields.';
const requiredEmailMessage = 'Fill this in with a proper email.';
const twoCharactersRequiredMessage = 'This field must be at least two characters.';

export default function RealmForm({ onSubmit, formData, setFormData, validationSchema, collapse = false }: Props) {
  const [formErrors, setFormErrors] = useState<{ [key in keyof CustomRealmFormData]?: boolean }>({});
  const [otherPrimaryEndUsersSelected, setOtherPrimaryEndUsersSelected] = useState(false);
  const [otherPrimaryEndUserDetails, setOtherPrimaryEndUserDetails] = useState('');
  const [submittingForm, setSubmittingForm] = useState(false);
  const [ministries, setMinistries] = useState<Ministry[]>([]);
  const [divisions, setDivisions] = useState<string[]>([]);
  const [branches, setBranches] = useState<string[]>([]);

  const handleFormInputChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
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

  const handleSubmit = () => {
    const submission = cloneDeep(formData);
    // Add other primary users if present
    if (otherPrimaryEndUsersSelected) {
      submission.primaryEndUsers.push(otherPrimaryEndUserDetails);
    }
    const { valid, errors } = validateForm(submission, validationSchema);
    if (!valid) {
      setFormErrors(errors as any);
      return;
    }
    setSubmittingForm(true);
    onSubmit(submission).then(() => setSubmittingForm(false));
  };

  const loadBranches = async (division: string = 'Other') => {
    const [data, err] = await getBranches(formData?.ministry as string, division);
    if (err) setBranches([]);
    else {
      setBranches(data || []);
    }
  };

  const loadDivisions = async (ministry: string) => {
    const [data, err] = await getDivisions(ministry);
    if (err) setDivisions([]);
    else {
      setDivisions(data || []);
    }
  };

  const loadMinistries = async () => {
    const [data] = await getMinistries();
    setMinistries((data as Ministry[]) || []);
  };

  useEffect(() => {
    loadMinistries();
  }, []);

  useEffect(() => {
    if (formData.ministry) {
      loadDivisions(formData?.ministry as string);
    }
  }, [formData.ministry]);

  useEffect(() => {
    if (formData.division) {
      loadBranches(formData.division as string);
    }
  }, [formData.division]);

  const schemaFields = Object.keys(validationSchema.fields);

  return (
    <>
      <SForm collapse={collapse}>
        <div className="input-wrapper first-col">
          <label htmlFor="realm-name-input" className="required with-info">
            1. Custom Realm name
            <InfoPopover>The realm name. Can only include letters, underscores and hypens.</InfoPopover>
          </label>
          <input
            required
            id="realm-name-input"
            name="realm"
            onChange={handleFormInputChange}
            value={formData.realm}
            disabled={!schemaFields.includes('realm')}
          />
          {formErrors.realm && <p className="error-message">{twoCharactersRequiredMessage}</p>}
        </div>

        <div className="input-wrapper second-col">
          <label htmlFor="product-name-input" className="with-info">
            2. Product Name
            <InfoPopover>Help us understand what product this realm is tied to</InfoPopover>
          </label>
          <input
            id="product-name-input"
            name="productName"
            onChange={handleFormInputChange}
            value={formData.productName}
            disabled={!schemaFields.includes('productName')}
          />
        </div>

        <div className="input-wrapper first-col">
          <label htmlFor="ministry">Ministry</label>
          <input
            list="ministry-list"
            id="ministry"
            name="ministry"
            onBlur={handleFormInputChange}
            disabled={!schemaFields.includes('ministry')}
          />

          <datalist id="ministry-list">
            {ministries.map((ministry: Ministry) => (
              <option value={ministry.title} key={ministry.id}>
                {ministry.title}
              </option>
            ))}
          </datalist>
        </div>

        <div className="input-wrapper second-col">
          <label htmlFor="division">Division</label>
          <input
            list="division-list"
            id="division"
            name="division"
            onBlur={handleFormInputChange}
            disabled={!schemaFields.includes('division')}
          />

          <datalist id="division-list">
            {divisions.map((division: any) => (
              <option value={division?.title} key={division?.id}>
                {division?.title}
              </option>
            ))}
          </datalist>
        </div>

        <div className="input-wrapper first-col">
          <label htmlFor="branch">Branch</label>
          <input
            list="branch-list"
            id="branch"
            name="branch"
            onBlur={handleFormInputChange}
            disabled={!schemaFields.includes('branch')}
          />

          <datalist id="branch-list">
            {branches.map((branch: any) => (
              <option value={branch?.title} key={branch?.id}>
                {branch?.title}
              </option>
            ))}
          </datalist>
        </div>

        <div className="input-wrapper second-col">
          <label htmlFor="realm-purpose-input" className="required with-info">
            2. Purpose of Realm
            <InfoPopover>What is this relams purpose?</InfoPopover>
          </label>
          <input
            required
            id="realm-purpose-input"
            name="purpose"
            onChange={handleFormInputChange}
            value={formData.purpose}
            disabled={!schemaFields.includes('purpose')}
          />
          {formErrors.purpose && <p className="error-message">{twoCharactersRequiredMessage}</p>}
        </div>

        <fieldset className="span-cols" disabled={!schemaFields.includes('primaryEndUsers')}>
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

        <fieldset className="span-cols" disabled={!schemaFields.includes('environments')}>
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
            disabled={!schemaFields.includes('productOwnerEmail')}
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
            disabled={!schemaFields.includes('productOwnerIdirUserId')}
          />
          {formErrors.productOwnerIdirUserId && <p className="error-message">{twoCharactersRequiredMessage}</p>}
        </div>

        <div className="input-wrapper first-col">
          <label htmlFor="technical-contact-email-input" className="required">
            7. Technical contact&apos;s email
          </label>
          <input
            required
            data-testid="tech-contact-email"
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
            data-testid="tech-contact-idir"
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

        {/* Below fields hidden instead of disabled if not in schema */}

        {schemaFields.includes('rcChannel') && (
          <div className="input-wrapper first-col">
            <label htmlFor="rcChannel">Rocket.Chat Channel</label>
            <input
              id="rcChannel"
              data-testid="rc-channel-input"
              type="text"
              placeholder="Rocket.Chat Channel"
              name="rcChannel"
              onChange={handleFormInputChange}
            />
          </div>
        )}

        {schemaFields.includes('rcChannelOwnedBy') && (
          <div className="input-wrapper second-col">
            <label htmlFor="rcChannelOwnedBy">Rocket.Chat Channel Owner</label>
            <input
              type="text"
              id="rcChannelOwnedBy"
              data-testid="rc-channel-owner-input"
              placeholder="Rocket.Chat Channel Owner"
              name="rcChannelOwnedBy"
              onChange={handleFormInputChange}
            />
          </div>
        )}

        {schemaFields.includes('materialToSend') && (
          <div className="input-wrapper first-col">
            <label htmlFor="materialToSend">Material To Send</label>
            <textarea
              rows={6}
              id="materialToSend"
              name="materialToSend"
              onChange={handleFormInputChange}
              placeholder="Material To Send"
            />
          </div>
        )}
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
