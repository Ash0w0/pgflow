alter table public.properties add column if not exists upi_qr_object_key text;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('upi-qr-assets','upi-qr-assets',false,2097152,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists upi_qr_owner_insert on storage.objects;
create policy upi_qr_owner_insert on storage.objects for insert to authenticated
with check(bucket_id='upi-qr-assets' and public.has_storage_org_membership(name,array['owner']::public.membership_role[]) and name ~ '^organizations/[^/]+/upi-qr/[^/]+$');
drop policy if exists upi_qr_staff_select on storage.objects;
create policy upi_qr_staff_select on storage.objects for select to authenticated
using(bucket_id='upi-qr-assets' and public.has_storage_org_membership(name,array['owner','manager','accountant']::public.membership_role[]) and name ~ '^organizations/[^/]+/upi-qr/[^/]+$');

drop function public.update_property_upi(uuid,uuid,uuid,text,text,text);
create function public.update_property_upi(
  p_actor_user_id uuid,p_organization_id uuid,p_property_id uuid,
  p_upi_id text,p_payee_name text,p_note_prefix text,p_qr_object_key text default null
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_upi text:=pg_catalog.lower(pg_catalog.btrim(p_upi_id));v_payee text:=pg_catalog.btrim(p_payee_name);v_prefix text:=pg_catalog.upper(pg_catalog.btrim(p_note_prefix));v_qr text:=nullif(pg_catalog.btrim(p_qr_object_key),'');
begin
  if not exists(select 1 from public.memberships where auth_user_id=p_actor_user_id and organization_id=p_organization_id and property_id=p_property_id and role='owner' and state='active') then raise exception using errcode='42501',message='Active property-owner access is required.';end if;
  if v_upi !~ '^[a-z0-9._-]{2,100}@[a-z0-9.-]{2,64}$' or pg_catalog.length(v_payee) not between 2 and 120 or v_prefix !~ '^[A-Z0-9-]{2,20}$' then raise exception using errcode='22023',message='Enter a valid UPI ID, payee name and note prefix.';end if;
  if v_qr is not null and v_qr !~ ('^organizations/'||p_organization_id::text||'/upi-qr/[^/]+$') then raise exception using errcode='22023',message='Uploaded UPI QR path is invalid.';end if;
  update public.properties set upi_id=v_upi,upi_payee_name=v_payee,upi_note_prefix=v_prefix,upi_qr_object_key=v_qr,updated_at=pg_catalog.now() where organization_id=p_organization_id and id=p_property_id;
  if not found then raise exception using errcode='P0001',message='Property not found.';end if;
  insert into public.audit_events(organization_id,actor_id,action,entity_type,entity_id,after_data) values(p_organization_id,p_actor_user_id,'property.upi_updated','property',p_property_id::text,pg_catalog.jsonb_build_object('payeeName',v_payee,'notePrefix',v_prefix,'upiConfigured',true,'uploadedQrConfigured',v_qr is not null));
  return pg_catalog.jsonb_build_object('configured',true,'payeeName',v_payee,'notePrefix',v_prefix,'uploadedQrConfigured',v_qr is not null);
end $$;
revoke all on function public.update_property_upi(uuid,uuid,uuid,text,text,text,text) from public;
grant execute on function public.update_property_upi(uuid,uuid,uuid,text,text,text,text) to service_role;
