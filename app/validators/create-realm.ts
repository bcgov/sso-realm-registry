import { RoleEnum } from 'utils/helpers';
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
 * Shared fields all roles can update
 */
const commonSchema = yup.object().shape({
  ministry: yup.string().optional().nullable(),
  division: yup.string().optional().nullable(),
  branch: yup.string().optional().nullable(),
  technicalContactIdirUserId: yup.string().required().min(2),
  technicalContactEmail: yup.string().required().email(),
  secondTechnicalContactEmail: yup.string().email().optional(),
  secondTechnicalContactIdirUserId: yup.string().optional(),
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
    productOwnerEmail: yup.string().required().email(),
    productOwnerIdirUserId: yup.string().required().min(2),
  })
  .concat(commonSchema);

export const getUpdateRealmSchemaByRole = (role: string = '') => {
  const productOwnerFields = yup
    .object()
    .shape({
      productName: yup.string().required(),
      purpose: yup.string().min(2).required(),
      primaryEndUsers: yup.array().optional(),
      productOwnerEmail: yup.string().email().required(),
      productOwnerIdirUserId: yup.string().required(),
    })
    .concat(commonSchema);

  switch (role) {
    case RoleEnum.ADMIN:
      return yup
        .object()
        .shape({
          approved: yup.string().optional().nullable(),
          rcChannel: yup.string().optional().nullable(),
          rcChannelOwnedBy: yup.string().optional().nullable(),
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
