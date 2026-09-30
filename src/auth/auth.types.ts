import type { ChildDto, GuardianDto } from '../bookings/bookings.types.js';

export interface GuardianProfile {
  guardian: GuardianDto;
  children: ChildDto[];
}

export interface AuthResult {
  token: string;
  profile: GuardianProfile;
}
