begin;

create extension if not exists pgtap with schema extensions;

select plan(10);

insert into auth.users (id, aud, role, email) values
  ('d1000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'wa-owner@example.test');
insert into public.organizations (id, name, slug, template_version_id, state)
values ('dd100000-0000-0000-0000-000000000001', 'WA PG', 'wa-pg', (select id from public.template_versions where version = '1.0.0'), 'live');
insert into public.properties (id, organization_id, name)
values ('dd100000-0000-0000-0000-0000000000a1', 'dd100000-0000-0000-0000-000000000001', 'WA PG');
insert into public.memberships (organization_id, property_id, auth_user_id, phone, display_name, role, state)
values ('dd100000-0000-0000-0000-000000000001', 'dd100000-0000-0000-0000-0000000000a1', 'd1000000-0000-0000-0000-000000000001', '+919000005001', 'WA Owner', 'owner', 'active');
insert into public.tenant_profiles (id, organization_id, property_id, full_name, phone)
values ('dd100000-0000-0000-0000-0000000000b1', 'dd100000-0000-0000-0000-000000000001', 'dd100000-0000-0000-0000-0000000000a1', 'WA Resident', '+919000005002');

-- Invoices due 3 days after, on, 3 days before, and 1 day after the reference date.
insert into public.invoices (id, organization_id, property_id, tenant_id, period, number, due_date, total_amount, paid_amount, state) values
  ('dd100000-0000-0000-0000-0000000000c1', 'dd100000-0000-0000-0000-000000000001', 'dd100000-0000-0000-0000-0000000000a1', 'dd100000-0000-0000-0000-0000000000b1', '2026-12', 'INV-WA-1', date '2026-12-08', 8000, 0, 'issued'),
  ('dd100000-0000-0000-0000-0000000000c2', 'dd100000-0000-0000-0000-000000000001', 'dd100000-0000-0000-0000-0000000000a1', 'dd100000-0000-0000-0000-0000000000b1', '2026-11', 'INV-WA-2', date '2026-12-05', 8000, 0, 'issued'),
  ('dd100000-0000-0000-0000-0000000000c3', 'dd100000-0000-0000-0000-000000000001', 'dd100000-0000-0000-0000-0000000000a1', 'dd100000-0000-0000-0000-0000000000b1', '2026-10', 'INV-WA-3', date '2026-12-02', 8000, 0, 'overdue'),
  ('dd100000-0000-0000-0000-0000000000c4', 'dd100000-0000-0000-0000-000000000001', 'dd100000-0000-0000-0000-0000000000a1', 'dd100000-0000-0000-0000-0000000000b1', '2026-09', 'INV-WA-4', date '2026-12-06', 8000, 0, 'issued');

select is(public.enqueue_rent_reminders(date '2026-12-05'), 0, 'no reminders are queued until the owner opts in');

update public.properties set whatsapp_auto_reminders = true, whatsapp_auto_receipts = true where id = 'dd100000-0000-0000-0000-0000000000a1';

select is(public.enqueue_rent_reminders(date '2026-12-05'), 3, 'reminders are queued 3 days before, on, and 3 days after the due date');
select is(
  (select string_agg(stage, ',' order by stage) from public.whatsapp_outbox where kind = 'rent_reminder' and organization_id = 'dd100000-0000-0000-0000-000000000001'),
  'before_due,due_today,overdue', 'each reminder carries its stage'
);
select is(public.enqueue_rent_reminders(date '2026-12-05'), 0, 'running the reminder job twice queues no duplicates');

update public.organizations set trial_ends_at = pg_catalog.now() - interval '1 minute', paid_until = null where id = 'dd100000-0000-0000-0000-000000000001';
delete from public.whatsapp_outbox where organization_id = 'dd100000-0000-0000-0000-000000000001';
select is(public.enqueue_rent_reminders(date '2026-12-05'), 0, 'read-only PGs get no reminders');
update public.organizations set trial_ends_at = pg_catalog.now() + interval '15 days' where id = 'dd100000-0000-0000-0000-000000000001';

insert into public.payments (id, organization_id, property_id, tenant_id, method, amount, reference, state, paid_at, submitted_by, approved_by, approved_at, invoice_id)
values ('dd100000-0000-0000-0000-0000000000d1', 'dd100000-0000-0000-0000-000000000001', 'dd100000-0000-0000-0000-0000000000a1', 'dd100000-0000-0000-0000-0000000000b1',
  'cash', 8000, null, 'approved', pg_catalog.now(), 'd1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', pg_catalog.now(), 'dd100000-0000-0000-0000-0000000000c1');
insert into public.receipts (organization_id, property_id, payment_id, invoice_id, tenant_id, number, amount, issued_by)
values ('dd100000-0000-0000-0000-000000000001', 'dd100000-0000-0000-0000-0000000000a1', 'dd100000-0000-0000-0000-0000000000d1', 'dd100000-0000-0000-0000-0000000000c1', 'dd100000-0000-0000-0000-0000000000b1', 'RCP-WA-1', 8000, 'd1000000-0000-0000-0000-000000000001');

select is(
  (select pg_catalog.count(*)::integer from public.whatsapp_outbox where kind = 'payment_receipt' and entity_id = 'dd100000-0000-0000-0000-0000000000d1'),
  1, 'issuing a receipt queues the resident''s WhatsApp receipt in the same transaction'
);

select is((select pg_catalog.count(*)::integer from public.claim_whatsapp_outbox(10, 'dd100000-0000-0000-0000-000000000001')), 1, 'the sender claims due messages');
select is((select state from public.whatsapp_outbox where kind = 'payment_receipt' and entity_id = 'dd100000-0000-0000-0000-0000000000d1'), 'sending', 'claimed messages are locked for one sender');
select is((select pg_catalog.count(*)::integer from public.claim_whatsapp_outbox(10, 'dd100000-0000-0000-0000-000000000001')), 0, 'a second sender cannot claim the same message');

select ok(
  not has_table_privilege('authenticated', 'public.whatsapp_outbox', 'select')
  and not has_table_privilege('anon', 'public.receipt_links', 'select')
  and not has_function_privilege('authenticated', 'public.create_system_payment_request(uuid,uuid,text,timestamptz)', 'execute')
  and not has_function_privilege('anon', 'public.enqueue_rent_reminders(date)', 'execute'),
  'the WhatsApp queue, receipt links and system payment links are server-only'
);

select * from finish();
rollback;
