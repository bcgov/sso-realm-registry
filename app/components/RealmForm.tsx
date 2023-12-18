import { CustomRealmFormData, PrimaryEndUser } from 'types/realm-profile';
import styled from 'styled-components';
import React, { useState, ChangeEvent, useEffect } from 'react';
import { Grid as SpinnerGrid } from 'react-loader-spinner';
import Button from '@button-inc/bcgov-theme/Button';
import { ValidationError } from 'yup';
import cloneDeep from 'lodash.clonedeep';
import { getMinistries, getDivisions, getBranches } from 'services/meta';
import InfoPopover from 'components/InfoPopover';
import { Ministry } from 'types/realm-profile';
import * as yup from 'yup';
import kebabCase from 'lodash.kebabcase';
import AsyncSelect from 'react-select/async';
import { getIdirUserId, getIdirUsersByEmail } from 'services/azure';

const SForm = styled.form<{ collapse: boolean }>`
  display: grid;
  grid-template-columns: ${(props) => (props.collapse ? '1fr' : '1fr 1fr')};
  column-gap: 2em;
  row-gap: 1em;
  font-size: 1rem;

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
      color: red;
    }

    &.with-info svg {
      margin: 0 0.3em;
    }
  }

  legend {
    font-weight: 700;
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
      margin-top: 0.2em;
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
    grid-template-columns: ${(props) => (props.collapse ? '1fr' : '1fr 1fr')};
    column-gap: 2em;
    row-gap: 1em;
  }

  label {
    font-weight: 700;
    font-size: 0.8rem;
  }

  input,
  select,
  textarea {
    scroll-margin-top: 1em;
    border: 2px solid #606060;
    border-radius: 0.25em;
    padding: 0.5em 0.6em;
    &:focus {
      outline: 4px solid #3b99fc;
      outline-offset: 1px;
    }
    &:disabled {
      background: #dddddd;
    }
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
  try {
    validationSchema.validateSync(data, { abortEarly: false, stripUnknown: true });
    return { valid: true, errors: null };
  } catch (e) {
    const err = e as ValidationError;
    const formErrors: { [key in keyof CustomRealmFormData]?: boolean } = {};
    let firstError = '';
    err.errors.forEach((error, i) => {
      // Yup error strings begin with object key
      const fieldName = error.split(' ')[0] as keyof CustomRealmFormData;
      if (i === 0) firstError = fieldName;
      formErrors[fieldName] = true;
    });
    // Scroll error into view if found
    try {
      const firstFieldInputId = `${kebabCase(firstError)}-input`;
      const firstErrorInput = document.querySelector(`#${firstFieldInputId}`);
      if (firstErrorInput) {
        firstErrorInput.scrollIntoView();
      }
    } catch (e) {}
    return { valid: false, errors: formErrors };
  }
};

interface Props {
  formData: CustomRealmFormData;
  setFormData: (data: CustomRealmFormData) => void;
  onSubmit: (data: CustomRealmFormData) => Promise<void>;
  onCancel: () => void;
  isAdmin?: boolean;
  isPO?: boolean;
  validationSchema: yup.AnyObjectSchema;
  collapse: boolean;
  updatedMessage?: string;
}

const requiredMessage = 'Fill in the required fields.';
const requiredEmailMessage = 'Fill this in with a proper email.';
const twoCharactersRequiredMessage = 'This field must be at least two characters.';

const defaultUserOptions = ['livingInBC', 'businessInBC', 'govEmployees'];
const hasOtherPrimaryEndUsers = (primaryEndUsers: PrimaryEndUser[]) =>
  primaryEndUsers.some((user) => !defaultUserOptions.includes(user));

const otherPrimaryEndUser = (primaryEndUsers: PrimaryEndUser[]) => {
  const hasOther = hasOtherPrimaryEndUsers(primaryEndUsers);
  if (hasOther) return primaryEndUsers.filter((user) => !defaultUserOptions.includes(user))[0];
  else return '';
};

export default function RealmForm({
  onSubmit,
  formData,
  setFormData,
  validationSchema,
  onCancel,
  updatedMessage,
  collapse = false,
}: Props) {
  const [formErrors, setFormErrors] = useState<{ [key in keyof CustomRealmFormData]?: boolean }>({});
  const [otherPrimaryEndUsersSelected, setOtherPrimaryEndUsersSelected] = useState(
    hasOtherPrimaryEndUsers(formData.primaryEndUsers),
  );
  const [otherPrimaryEndUserDetails, setOtherPrimaryEndUserDetails] = useState(
    otherPrimaryEndUser(formData.primaryEndUsers),
  );
  const [submittingForm, setSubmittingForm] = useState(false);
  const [ministries, setMinistries] = useState<Ministry[]>([]);
  const [divisions, setDivisions] = useState<string[]>([]);
  const [branches, setBranches] = useState<string[]>([]);

  const fuzzySearchIdirUsersByEmail = async (email: string) => {
    if (email.length > 2) {
      const [data] = await getIdirUsersByEmail(email);
      const options = data?.map((u) => {
        return {
          value: u.id,
          label: u.mail,
        };
      });
      return new Promise<any>((resolve) => {
        resolve(options);
      });
    }
  };

  const handleFormSelectChange = async (e: any, selectorName: string, dependentInput: string) => {
    let idirUserId: string | null = '';
    if (e?.value) {
      [idirUserId] = await getIdirUserId(e?.value);
      if (idirUserId) setFormErrors({ ...formErrors, [selectorName]: false, [dependentInput]: false });
    }
    setFormData({ ...formData, [selectorName]: e?.label || '', [dependentInput]: idirUserId || '' });
  };

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
    // Update primary users
    submission.primaryEndUsers = submission.primaryEndUsers.filter((user) => defaultUserOptions.includes(user));
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
          <label htmlFor="realm-input" className="required with-info">
            Custom Realm name
            <InfoPopover>The realm name. Can only include letters, underscores and hypens.</InfoPopover>
          </label>
          <input
            required
            id="realm-input"
            name="realm"
            onChange={handleFormInputChange}
            value={formData.realm}
            disabled={!schemaFields.includes('realm')}
          />
          {formErrors.realm && (
            <p className="error-message">Realm name should contain only letters, underscores and hypens</p>
          )}
        </div>

        <div className="input-wrapper second-col">
          <label htmlFor="product-name-input" className="with-info required">
            Product Name
            <InfoPopover>Help us understand what product this realm is tied to</InfoPopover>
          </label>
          <input
            id="product-name-input"
            name="productName"
            onChange={handleFormInputChange}
            value={formData.productName}
            disabled={!schemaFields.includes('productName')}
          />
          {formErrors.productName && <p className="error-message">{twoCharactersRequiredMessage}</p>}
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
            {divisions.map((division: string) => (
              <option value={division} key={division}>
                {division}
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
              <option value={branch} key={branch}>
                {branch}
              </option>
            ))}
          </datalist>
        </div>

        <div className="input-wrapper second-col">
          <label htmlFor="purpose-input" className="required with-info">
            Purpose of Realm
            <InfoPopover>What is this relams purpose?</InfoPopover>
          </label>
          <input
            required
            id="purpose-input"
            name="purpose"
            onChange={handleFormInputChange}
            value={formData.purpose}
            disabled={!schemaFields.includes('purpose')}
          />
          {formErrors.purpose && <p className="error-message">{twoCharactersRequiredMessage}</p>}
        </div>

        <fieldset className="span-cols" disabled={!schemaFields.includes('primaryEndUsers')}>
          <legend className="required">
            Who are the primary end users of your project/application? (select all that apply)
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
          <legend className="required">Select all applicable environments</legend>
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
            Product owner&apos;s email
          </label>
          <AsyncSelect
            id="product-owner-email-input"
            name="productOwnerEmail"
            loadOptions={fuzzySearchIdirUsersByEmail}
            onChange={(e: any) => handleFormSelectChange(e, 'productOwnerEmail', 'productOwnerIdirUserId')}
            isClearable
            noOptionsMessage={() => 'Start typing email...'}
            defaultValue={() => {
              if (formData.productOwnerEmail) return { label: formData.productOwnerEmail };
            }}
            className="product-owner-email"
            classNamePrefix="product-owner-email"
            isDisabled={!schemaFields.includes('productOwnerEmail')}
          />

          {formErrors.productOwnerEmail && <p className="error-message">{requiredEmailMessage}</p>}
        </div>

        <div className="input-wrapper second-col">
          <label htmlFor="product-owner-idir-input" className="required">
            Product owner&apos;s IDIR
          </label>
          <input
            required
            id="product-owner-idir-input"
            name="productOwnerIdirUserId"
            value={formData.productOwnerIdirUserId}
            onChange={handleFormInputChange}
            disabled
          />
          {formErrors.productOwnerIdirUserId && <p className="error-message">{twoCharactersRequiredMessage}</p>}
        </div>

        <div className="input-wrapper first-col">
          <label htmlFor="technical-contact-email-input" className="required">
            Technical contact&apos;s email
          </label>
          <AsyncSelect
            id="technical-contact-email-input"
            name="technicalContactEmail"
            loadOptions={fuzzySearchIdirUsersByEmail}
            onChange={(e: any) => handleFormSelectChange(e, 'technicalContactEmail', 'technicalContactIdirUserId')}
            isClearable
            noOptionsMessage={() => 'Start typing email...'}
            defaultValue={() => {
              if (formData.technicalContactEmail) return { label: formData.technicalContactEmail };
            }}
            className="technical-contact-email"
            classNamePrefix="technical-contact-email"
          />

          {formErrors.technicalContactEmail && <p className="error-message">{requiredEmailMessage}</p>}
        </div>

        <div className="input-wrapper second-col">
          <label htmlFor="technical-contact-idir-input" className="required">
            Technical contact&apos;s IDIR
          </label>
          <input
            required
            data-testid="tech-contact-idir"
            id="technical-contact-idir-input"
            name="technicalContactIdirUserId"
            value={formData.technicalContactIdirUserId}
            onChange={handleFormInputChange}
            disabled
          />
          {formErrors.technicalContactIdirUserId && <p className="error-message">{twoCharactersRequiredMessage}</p>}
        </div>

        <div className="input-wrapper first-col">
          <label htmlFor="secondary-contact-email-input">Secondary technical contact&apos;s email</label>
          <AsyncSelect
            id="secondary-contact-email-input"
            name="secondTechnicalContactEmail"
            loadOptions={fuzzySearchIdirUsersByEmail}
            onChange={(e: any) =>
              handleFormSelectChange(e, 'secondTechnicalContactEmail', 'secondTechnicalContactIdirUserId')
            }
            isMulti={false}
            isClearable
            noOptionsMessage={() => 'Start typing email...'}
            defaultValue={() => {
              if (formData.secondTechnicalContactEmail) return { label: formData.secondTechnicalContactEmail };
            }}
            className="secondary-contact-email"
            classNamePrefix="secondary-contact-email"
          />

          {formErrors.secondTechnicalContactEmail && <p className="error-message">{requiredEmailMessage}</p>}
        </div>

        <div className="input-wrapper second-col">
          <label htmlFor="secondary-contact-idir-input">Secondary technical contact&apos;s IDIR</label>
          <input
            required
            id="secondary-contact-idir-input"
            data-testid="secondary-contact-idir"
            name="secondTechnicalContactIdirUserId"
            value={formData.secondTechnicalContactIdirUserId}
            onChange={handleFormInputChange}
            disabled
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
              value={formData.rcChannel}
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
              value={formData.rcChannelOwnedBy}
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
              value={formData.materialToSend}
              placeholder="Material To Send"
            />
          </div>
        )}
      </SForm>

      {updatedMessage && <p>{updatedMessage}</p>}

      <ButtonContainer className="button-container">
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} disabled={submittingForm}>
          {submittingForm ? <SpinnerGrid color="#fff" height={15} width={15} wrapperClass="d-block" /> : 'Submit'}
        </Button>
      </ButtonContainer>
    </>
  );
}
