export interface RealmProfile extends CustomRealmFormData {
  displayName: string;
  openshiftNamespace: string;
  productOwnerName: string;
  willingToMove: string;
  whenToMove: string;
  createdAt: string;
  updatedAt: string;
  environments: Environment[];
  outOfSync?: boolean;
  /** Admin only: true when membership has adds or revokes still pending in Keycloak. */
  needsSync?: boolean;
  /** Admin only: members whose contact never resolved in the directory. */
  unresolvedMemberCount?: number;
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

export type MemberRole = 'product_owner' | 'technical_lead' | 'additional';

/**
 * A membership slot as the form holds it. Only `userId` / `azureId` are sent to the
 * server; the email and username are display values re-derived from the directory.
 */
export interface RealmMember {
  /** Set for a member already stored in the registry. */
  userId?: number;
  /** Azure object id, set when the row was just picked out of the directory search. */
  azureId?: string;
  email: string;
  idirUsername: string;
}

/** A stored membership row as the server returns it. */
export interface RealmMemberProfile {
  id: number;
  userId: number;
  role: MemberRole;
  idirUsername: string;
  email: string | null;
  displayName: string | null;
  resolvedAt: string | null;
  syncedAt: string | null;
}

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
  productOwner: RealmMember | null;
  technicalLead: RealmMember | null;
  /** Null entries are rows the user added but has not filled in yet; they are dropped on submit. */
  additionalUsers: (RealmMember | null)[];
  approved?: boolean | null;
  materialToSend?: string;
  status?: Status;
  archived?: boolean;
  members?: RealmMemberProfile[];
}

export interface Ministry {
  title: string;
  id: string;
  name: string;
}

export interface AzureUser {
  businessPhones?: string[];
  displayName: string;
  givenName?: string;
  jobTitle?: string;
  mail: string;
  mobilePhone?: string;
  officeLocation?: string;
  preferredLanguage?: string;
  surname?: string;
  userPrincipalName?: string;
  id: string;
  /** Selected by the search so a pick needs no follow up lookup for the IDIR username. */
  onPremisesSamAccountName?: string | null;
  mailNickname?: string | null;
}
