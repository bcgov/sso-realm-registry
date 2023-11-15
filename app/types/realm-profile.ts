export interface RealmProfile {
  id: string;
  realm: string;
  displayName: string;
  product_name: string;
  openshift_namespace: string;
  ministry: string;
  division: string;
  branch: string;
  product_owner_email: string;
  product_owner_idir_userid: string;
  product_owner_name: string;
  technical_contact_email: string;
  technical_contact_idir_userid: string;
  technical_contact_name: string;
  second_technical_contact_name: string;
  second_technical_contact_email: string;
  second_technical_contact_idir_userid: string;
  willing_to_move: string;
  when_to_move: string;
  idps: string[];
  created_at: string;
  updated_at: string;
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
  id?: number;
  realm: string;
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
  status: Status;
}
