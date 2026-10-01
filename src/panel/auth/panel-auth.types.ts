export interface EducatorProfile {
  id: string;
  name: string;
  email: string;
}

export interface PanelAuthResult {
  token: string;
  educator: EducatorProfile;
}
