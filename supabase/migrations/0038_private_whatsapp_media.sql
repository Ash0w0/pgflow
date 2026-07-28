insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'whatsapp-inbound',
  'whatsapp-inbound',
  false,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

comment on table public.whatsapp_messages is
  'Current message projection. Private inbound media metadata may be stored in provider_payload; media bytes remain in organization-scoped private Storage.';
