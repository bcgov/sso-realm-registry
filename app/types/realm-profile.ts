export interface RealmProfile extends CustomRealmFormData {
  displayName: string;
  openshiftNamespace: string;
  productOwnerName: string;
  willingToMove: string;
  whenToMove: string;
  idps: string[];
  createdAt: string;
  updatedAt: string;
  [key: string]: any;
}

export interface ModalData {
  willing_to_move?: string;
  when_to_move?: string;
}

type PrimaryEndUser = 'livingInBc' | 'businessInBC' | 'govEmployees' | string;
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
  environments: Environment[];
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
}

export interface Ministry {
  title: string;
  id: string;
  name: string;
}
