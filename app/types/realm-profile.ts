export interface RealmProfile extends CustomRealmFormData {
  displayName: string;
  openshiftNamespace: string;
  productOwnerName: string;
  willingToMove: string;
  whenToMove: string;
  idps: string[];
  createdAt: string;
  updatedAt: string;
  environments: Environment[];
  [key: string]: any;
}

export interface ModalData {
  willing_to_move?: string;
  when_to_move?: string;
}

export type PrimaryEndUser = 'livingInBc' | 'businessInBC' | 'govEmployees' | string;
type Environment = 'dev' | 'test' | 'prod' | string;
type Status =
  | 'unapproved'
  | 'declined'
  | 'pending'
  | 'prSuccess'
  | 'PrFailed'
  | 'planned'
  | 'planFailed'
  | 'applied'
  | 'applyFailed';

export interface CustomRealmFormData {
  id?: number | string;
  realm: string;
  productName?: string;
  ministry?: string;
  division?: string;
  branch?: string;
  purpose: string;
  primaryEndUsers: PrimaryEndUser[];
  preferredAdminLoginMethod?: string;
  productOwnerEmail: string;
  productOwnerIdirUserId: string;
  technicalContactEmail: string;
  technicalContactIdirUserId: string;
  secondTechnicalContactIdirUserId: string;
  secondTechnicalContactEmail: string;
  approved?: boolean | null;
  rcChannel?: string;
  rcChannelOwnedBy?: string;
  materialToSend?: string;
  status?: Status;
  archived?: boolean;
}

export interface Ministry {
  title: string;
  id: string;
  name: string;
}

export interface AzureUser {
  businessPhones: string[];
  displayName: string;
  givenName: string;
  jobTitle: string;
  mail: string;
  mobilePhone: string;
  officeLocation: string;
  preferredLanguage: string;
  surname: string;
  userPrincipalName: string;
  id: string;
}
