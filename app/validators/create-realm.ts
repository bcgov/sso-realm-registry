import { RoleEnum } from 'utils/helpers';
import * as yup from 'yup';

export enum ActionEnum {
  TF_PLAN = 'tf_plan',
  TF_APPLY = 'tf_apply',
}

<<<<<<< HEAD
export enum StatusEnum {
  UNAPPROVED = 'unapproved',
  DECLINED = 'declined',
=======
export enum LoginIDPEnum {
  IDIR = 'idir',
  AZUREIDIR = 'azureidir',
}

export enum StatusEnum {
>>>>>>> dev
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
}

export enum EnvironmentsEnum {
  DEV = 'dev',
  TEST = 'test',
  PROD = 'prod',
}

export const createRealmSchema = yup.object().shape({
  realm: yup
    .string()
    .required()
    .min(2)
    .matches(/^[A-Za-z][A-Za-z0-9_-]*$/, 'realm name should contain only letters, underscores and hypens'),
  purpose: yup.string().min(2).required(),
  primaryEndUsers: yup.array().required().min(1),
  environments: yup.array().required().min(1),
  technicalContactEmail: yup.string().required().email(),
  productOwnerEmail: yup.string().required().email(),
  technicalContactIdirUserId: yup.string().required().min(2),
  productOwnerIdirUserId: yup.string().required().min(2),
  secondTechnicalContactEmail: yup.string().email().optional(),
  secondTechnicalContactIdirUserId: yup.string().optional(),
  status: yup.string().matches(/pending/),
});

const commonSchema = yup.object().shape({
  ministry: yup.string().required(),
  division: yup.string().required(),
  branch: yup.string().required(),
});

const technicalContactSchema = yup
  .object()
  .shape({
    technicalContactIdirUserId: yup.string().min(2).required(),
    technicalContactEmail: yup.string().email().required(),
    secondTechnicalContactEmail: yup.string().email().optional(),
    secondTechnicalContactIdirUserId: yup.string().optional(),
  })
  .required();

export const getUpdateRealmSchemaByRole = (role: string = '') => {
  switch (role) {
    case RoleEnum.ADMIN:
      return yup.object().shape({
<<<<<<< HEAD
        approved: yup.string().optional().nullable(),
        productName: yup.string().required().optional().nullable(),
        productOwnerEmail: yup.string().email().optional().nullable(),
        productOwnerIdirUserId: yup.string().optional().nullable(),
        primaryEndUsers: yup.array().optional().nullable(),
        rcChannel: yup.string().optional().nullable(),
        rcChannelOwnedBy: yup.string().optional().nullable(),
        materialToSend: yup.string().optional().nullable(),
        technicalContactIdirUserId: yup.string().min(2).optional().nullable(),
        technicalContactEmail: yup.string().email().optional().nullable(),
        secondTechnicalContactEmail: yup.string().email().optional().nullable(),
        secondTechnicalContactIdirUserId: yup.string().optional().nullable(),
        ministry: yup.string().optional().nullable(),
        division: yup.string().optional().nullable(),
        branch: yup.string().optional().nullable(),
=======
        approved: yup.string().optional(),
        productName: yup.string().required().optional(),
        productOwnerEmail: yup.string().email().optional(),
        productOwnerIdirUserId: yup.string().optional(),
        primaryEndUsers: yup.array().optional(),
        rcChannel: yup.string().optional(),
        rcChannelOwnedBy: yup.string().optional(),
        materialToSend: yup.string().optional(),
        technicalContactIdirUserId: yup.string().min(2).optional(),
        technicalContactEmail: yup.string().email().optional(),
        secondTechnicalContactEmail: yup.string().email().optional(),
        secondTechnicalContactIdirUserId: yup.string().optional(),
        ministry: yup.string().optional(),
        division: yup.string().optional(),
        branch: yup.string().optional(),
>>>>>>> dev
      });
    case RoleEnum.PRODUCT_OWNER:
      return yup
        .object()
        .shape({
          productName: yup.string().required(),
          productOwnerEmail: yup.string().email().required(),
          productOwnerIdirUserId: yup.string().required(),
          primaryEndUsers: yup.array().optional(),
        })
        .concat(commonSchema)
        .concat(technicalContactSchema);
    default:
      return commonSchema.concat(technicalContactSchema);
  }
};

export const requestUpdateSchema = yup
  .object({
    id: yup.number().required(),
    status: yup.string().oneOf([StatusEnum.APPLIED, StatusEnum.APPLYFAILED]).required(),
    error: yup.string(),
  })
  .required();
<<<<<<< HEAD
=======

export const realmPlanAndApplySchema = yup
  .object({
    ids: yup.array().required().min(1),
    action: yup.string().oneOf([ActionEnum.TF_PLAN, ActionEnum.TF_APPLY]).required(),
    status: yup.boolean().required(),
  })
  .required();
>>>>>>> dev
