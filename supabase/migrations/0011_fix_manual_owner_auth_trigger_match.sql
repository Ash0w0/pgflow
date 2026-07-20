-- Supabase Auth can expose the newly inserted phone to an auth.users trigger
-- in canonical E.164 form without the optional leading "+". Validate the
-- trusted NEW trigger row directly instead of re-querying auth.users from its
-- own write transaction. All manual-confirmation, stable-ID, request-ID, and
-- metadata checks remain fail-closed.

do $$
declare
  v_function_definition text;
  v_old_completion_guard constant text := $old_completion_guard$
  if v_invitation.manual_phone_confirmed_at is null
    or v_invitation.manual_phone_confirmed_by is null
    or not exists (
      select 1
      from auth.users as auth_user
      where auth_user.id = p_auth_user_id
        and pg_catalog.btrim(auth_user.phone) = v_invitation.phone
        and auth_user.phone_confirmed_at is not null
        and auth_user.raw_app_meta_data @> pg_catalog.jsonb_build_object(
          'pgflow_activation', 'manual_owner',
          'pgflow_invitation_id', p_invitation_id::text,
          'pgflow_organization_id', p_organization_id::text,
          'pgflow_phone_confirmation', 'manual_operator',
          'pgflow_activation_request_id', p_activation_request_id::text
        )
    )
  then
    raise exception using errcode = '22023', message = 'The Auth user must match the manually confirmed owner activation record.';
  end if;
$old_completion_guard$;
  v_new_completion_guard constant text := $new_completion_guard$
  if v_invitation.manual_phone_confirmed_at is null
    or v_invitation.manual_phone_confirmed_by is null
  then
    raise exception using errcode = '22023', message = 'The Auth user must match the manually confirmed owner activation record.';
  end if;
$new_completion_guard$;
  v_trigger_anchor constant text := $trigger_anchor$
  perform public.complete_manual_owner_activation(
    new.id,
    v_organization_id,
    v_invitation_id,
    v_activation_request_id
  );
$trigger_anchor$;
  v_trigger_validation constant text := $trigger_validation$
  if new.id <> v_invitation.activation_auth_user_id
    or new.phone_confirmed_at is null
    or pg_catalog.regexp_replace(
      pg_catalog.btrim(coalesce(new.phone, '')),
      '^\+',
      ''
    ) !~ '^91[6-9][0-9]{9}$'
    or pg_catalog.regexp_replace(
      pg_catalog.btrim(coalesce(new.phone, '')),
      '^\+',
      ''
    ) <> pg_catalog.regexp_replace(
      pg_catalog.btrim(v_invitation.phone),
      '^\+',
      ''
    )
    or not (
      new.raw_app_meta_data @> pg_catalog.jsonb_build_object(
        'pgflow_activation', 'manual_owner',
        'pgflow_invitation_id', v_invitation_id::text,
        'pgflow_organization_id', v_organization_id::text,
        'pgflow_phone_confirmation', 'manual_operator',
        'pgflow_activation_request_id', v_activation_request_id::text
      )
    )
  then
    raise exception using errcode = '22023', message = 'The Auth user must match the manually confirmed owner activation record.';
  end if;

  perform public.complete_manual_owner_activation(
    new.id,
    v_organization_id,
    v_invitation_id,
    v_activation_request_id
  );
$trigger_validation$;
begin
  select pg_catalog.pg_get_functiondef(
    'public.complete_manual_owner_activation(uuid,uuid,uuid,uuid)'::pg_catalog.regprocedure
  ) into strict v_function_definition;

  if pg_catalog.strpos(v_function_definition, v_old_completion_guard) = 0 then
    raise exception 'Expected manual owner completion guard was not found; refusing a partial migration.';
  end if;

  execute pg_catalog.replace(
    v_function_definition,
    v_old_completion_guard,
    v_new_completion_guard
  );

  select pg_catalog.pg_get_functiondef(
    'public.complete_manual_owner_activation_on_auth_user()'::pg_catalog.regprocedure
  ) into strict v_function_definition;

  if pg_catalog.strpos(v_function_definition, v_trigger_anchor) = 0 then
    raise exception 'Expected manual owner Auth trigger anchor was not found; refusing a partial migration.';
  end if;

  execute pg_catalog.replace(
    v_function_definition,
    v_trigger_anchor,
    v_trigger_validation
  );
end;
$$;

revoke all on function public.complete_manual_owner_activation(uuid, uuid, uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.complete_manual_owner_activation_on_auth_user()
  from public, anon, authenticated, service_role;

comment on function public.complete_manual_owner_activation_on_auth_user() is
  'Fail-closed manual owner activation guard; validates the trusted NEW Auth row and canonical Indian E.164 phone identity before granting authority.';
