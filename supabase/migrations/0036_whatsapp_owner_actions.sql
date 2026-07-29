-- One-time, contextual two-step owner confirmation for financial actions.

create or replace function public.confirm_whatsapp_payment_action(
  p_token_hash text,
  p_sender_phone text,
  p_context_wamid text,
  p_decision text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_challenge public.whatsapp_action_challenges;
  v_contact public.whatsapp_contacts;
  v_membership public.memberships;
  v_payment public.payments;
  v_result jsonb;
begin
  if p_decision not in ('approve', 'reject') then
    raise exception using errcode = '22023', message = 'Decision is invalid.';
  end if;

  select * into v_challenge
  from public.whatsapp_action_challenges
  where token_hash = p_token_hash
    and context_wamid = p_context_wamid
    and action = case when p_decision = 'approve' then 'payment_approve' else 'payment_reject' end
  for update;

  if not found
    or v_challenge.state <> 'pending'
    or v_challenge.expires_at <= pg_catalog.now()
  then
    raise exception using errcode = '42501', message = 'This confirmation is invalid or expired.';
  end if;

  select * into strict v_contact
  from public.whatsapp_contacts
  where id = v_challenge.contact_id
    and organization_id = v_challenge.organization_id
    and membership_id = v_challenge.membership_id
    and phone_e164 = p_sender_phone
    and consent_state = 'opted_in';

  select * into strict v_membership
  from public.memberships
  where id = v_challenge.membership_id
    and organization_id = v_challenge.organization_id
    and auth_user_id is not null
    and role in ('owner', 'accountant')
    and state = 'active';

  select * into strict v_payment
  from public.payments
  where id = v_challenge.entity_id
    and organization_id = v_challenge.organization_id
    and state = 'pending_review'
  for update;

  v_result := public.review_payment(
    v_membership.auth_user_id,
    v_challenge.organization_id,
    v_payment.property_id,
    v_payment.id,
    p_decision,
    p_reason
  );

  update public.whatsapp_action_challenges
  set state = 'used',
      used_at = pg_catalog.now(),
      result_entity_id = v_payment.id
  where id = v_challenge.id;

  insert into public.audit_events (
    organization_id, actor_id, actor_kind, action, entity_type, entity_id, after_data
  ) values (
    v_challenge.organization_id,
    v_membership.auth_user_id,
    'user',
    case p_decision
      when 'approve' then 'whatsapp.payment_approved'
      else 'whatsapp.payment_rejected'
    end,
    'payment',
    v_payment.id::text,
    pg_catalog.jsonb_build_object(
      'channel', 'whatsapp',
      'contactId', v_contact.id,
      'membershipId', v_membership.id,
      'challengeId', v_challenge.id,
      'contextWamid', p_context_wamid,
      'result', v_result
    )
  );

  return v_result || pg_catalog.jsonb_build_object(
    'channel', 'whatsapp',
    'challengeId', v_challenge.id
  );
exception
  when no_data_found then
    raise exception using errcode = '42501', message = 'Sender or action context is not authorized.';
end
$$;

revoke all on function public.confirm_whatsapp_payment_action(text,text,text,text,text)
  from public, anon, authenticated;
grant execute on function public.confirm_whatsapp_payment_action(text,text,text,text,text)
  to service_role;
