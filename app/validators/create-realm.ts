import { RoleEnum } from 'utils/helpers';
import { MAX_ADDITIONAL_USERS } from 'utils/constants';
import * as yup from 'yup';

export enum ActionEnum {
  TF_PLAN = 'tf_plan',
  TF_APPLY = 'tf_apply',
}

export enum LoginIDPEnum {
  IDIR = 'idir',
  AZUREIDIR = 'azureidir',
}

export enum StatusEnum {
  PENDING = 'pending',
  PRSUCCESS = 'prSuccess',
  PRFAILED = 'PrFailed',
  PLANNED = 'planned',
  PLANFAILED = 'planFailed',
  APPLIED = 'applied',
  APPLYFAILED = 'applyFailed',
}

export enum EventEnum {
  REQUEST_CREATE_SUCCESS = 'request-create-success',
  REQUEST_CREATE_FAILED = 'request-create-failed',
  REQUEST_UPDATE_SUCCESS = 'request-update-success',
  REQUEST_UPDATE_FAILED = 'request-update-failed',
  REQUEST_APPROVE_SUCCESS = 'request-approve-success',
  REQUEST_REJECT_SUCCESS = 'request-reject-success',
  REQUEST_PR_SUCCESS = 'request-pr-success',
  REQUEST_PR_FAILED = 'request-pr-failed',
  REQUEST_PLAN_SUCCESS = 'request-plan-success',
  REQUEST_PLAN_FAILED = 'request-plan-failed',
  REQUEST_APPLY_SUCCESS = 'request-apply-success',
  REQUEST_APPLY_FAILED = 'request-apply-failed',
  REQUEST_DELETE_FAILED = 'request-delete-failed',
  REQUEST_DELETE_SUCCESS = 'request-delete-success',
  REQUEST_RESTORE_SUCCESS = 'request-restore-success',
  REQUEST_RESTORE_FAILED = 'request-restore-failed',
}

export enum EnvironmentsEnum {
  DEV = 'dev',
  TEST = 'test',
  PROD = 'prod',
}

/**
 * A membership slot. The client only ever identifies a person: `azureId` for a fresh
 * pick out of the directory search, `userId` for a member that was already saved.
 * Anything else in the payload (guid, username, email) is stripped, because the stored
 * guid is the direct provisioning key for realm admin access.
 */
export const memberSchema = yup
  .object()
  .shape({
    userId: yup.number().integer().positive().optional(),
    azureId: yup.string().optional(),
  })
  .test('member-identified', '${path} must be selected', (value) => Boolean(value?.userId || value?.azureId));

/**
 * Shared fields all roles can update. Product owner and technical lead are symmetric on
 * membership: either may change any slot, so membership lives here rather than in the
 * product owner branch.
 */
const commonSchema = yup.object().shape({
  ministry: yup.string().optional().nullable(),
  division: yup.string().optional().nullable(),
  branch: yup.string().optional().nullable(),
  productOwner: memberSchema,
  technicalLead: memberSchema,
  additionalUsers: yup
    .array()
    .of(memberSchema)
    .max(MAX_ADDITIONAL_USERS, `additionalUsers may contain at most ${MAX_ADDITIONAL_USERS} people`)
    .optional()
    .default([]),
});

export const createRealmSchema = yup
  .object()
  .shape({
    realm: yup
      .string()
      .required()
      .min(2)
      .max(36)
      .matches(
        /^[A-Za-z][A-Za-z0-9_-]*$/,
        'realm name must be of length between 2 and 36 and may contain only letters, underscores and hypens',
      ),
    purpose: yup.string().min(2).required(),
    productName: yup.string().required(),
    primaryEndUsers: yup.array().required().min(1),
  })
  .concat(commonSchema);

export const getUpdateRealmSchemaByRole = (role: string = '') => {
  const productOwnerFields = yup
    .object()
    .shape({
      productName: yup.string().required(),
      purpose: yup.string().min(2).required(),
      primaryEndUsers: yup.array().optional(),
    })
    .concat(commonSchema);

  switch (role) {
    case RoleEnum.ADMIN:
      return yup
        .object()
        .shape({
          approved: yup.string().optional().nullable(),
          materialToSend: yup.string().optional().nullable(),
        })
        .concat(productOwnerFields);
    case RoleEnum.PRODUCT_OWNER:
      return productOwnerFields;
    default:
      return commonSchema;
  }
};

export const requestUpdateSchema = yup
  .object({
    id: yup.number().required(),
    status: yup.string().oneOf([StatusEnum.APPLIED, StatusEnum.APPLYFAILED]).required(),
    error: yup.string(),
  })
  .required();

export const realmPlanAndApplySchema = yup
  .object({
    ids: yup.array().required().min(1),
    action: yup.string().oneOf([ActionEnum.TF_PLAN, ActionEnum.TF_APPLY]).required(),
    success: yup.string().required().oneOf(['true', 'false']),
  })
  .required();
