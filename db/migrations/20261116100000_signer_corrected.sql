-- Sender correction of a waiting signer's name or email after send.
-- A new audit event kind records the old and new values in the hash chain.
-- Keeps 'copied' (copy to a new draft, the migration before this one) in the list.

alter table public.audit_events
  drop constraint if exists audit_events_event_check;

alter table public.audit_events
  add constraint audit_events_event_check
    check (event in (
      'created',
      'sent',
      'viewed',
      'consented',
      'verified',
      'verification_failed',
      'signed',
      'declined',
      'reminded_manual',
      'email_sent',
      'completed',
      'voided',
      'deadline_changed',
      'expired',
      'reminded_auto',
      'reauthentication_failed',
      'copied',
      'signer_corrected'
    ));
