export interface UserSession {
  preferred_username: string;
  idir_username: string;
  given_name: string;
  family_name: string;
  email: string;
  client_roles: string[];
  [key: string]: any;
}
