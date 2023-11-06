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

export interface CustomRealmFormData {
  id?: number;
  realmName : string;
  realmPurpose: string;
  primaryUsers: {
      livingInBC: boolean;
      businessInBC: boolean;
      govEmployees: boolean;
      other: boolean;
      otherDetails: string;
  }
  environments: {
      dev: boolean;
      test: boolean;
      prod: boolean;
  },
  loginIdp: string;
  productOwnerEmail: string;
  productOwnerIdir: string;
  technicalContactEmail: string;
  technicalContactIdir: string;
  secondaryTechnicalContactIdir: string;
  secondaryTechnicalContactEmail: string;
  status?: 'pending' | 'approved' | 'declined' | 'created';
  [key: string]: any;
}
