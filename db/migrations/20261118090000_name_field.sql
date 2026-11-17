-- A name field: filled in with the signer's name when they sign, the way a
-- date field is filled in with the day. The signer does not type it.

alter table public.fields
  drop constraint if exists fields_type_check;

alter table public.fields
  add constraint fields_type_check check (
    type in (
      'signature',
      'initials',
      'date',
      'name',
      'text',
      'checkbox',
      'number',
      'dropdown',
      'radio'
    )
  );
