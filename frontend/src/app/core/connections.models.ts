export type InvitationBox = 'received' | 'sent';
export type InvitationAction = 'accept' | 'reject' | 'revoke';
export interface ConnectionInvitation {
  id: string;
  trainer_id: string;
  athlete_id: string;
  inviter_id: string;
  recipient_id: string;
  direction: 'trainer_to_athlete' | 'athlete_to_trainer';
  status: 'pending' | 'accepted' | 'expired' | 'revoked';
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
  revoked_by: string | null;
  other_display_name: string | null;
  other_alias: string | null;
}
