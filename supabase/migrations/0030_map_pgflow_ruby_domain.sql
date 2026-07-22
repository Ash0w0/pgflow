-- Migration 0030: Map pgflow-ruby.vercel.app to primary production PG organization

DO $$
DECLARE
  v_org_id uuid;
BEGIN
  -- 1. Find an existing active organization or use default UUID
  SELECT id INTO v_org_id FROM public.organizations WHERE state != 'archived' ORDER BY created_at ASC LIMIT 1;
  
  IF v_org_id IS NULL THEN
    v_org_id := '00000000-0000-4000-8000-000000000001'::uuid;
    INSERT INTO public.organizations (id, name, slug, state)
    VALUES (v_org_id, 'Nivasa PG', 'nivasa-pg', 'core_ready')
    ON CONFLICT (id) DO NOTHING;
  END IF;

  -- 2. Ensure brand theme exists
  INSERT INTO public.brand_themes (organization_id, app_name, short_name, primary_color, accent_color)
  VALUES (v_org_id, 'Nivasa PG', 'Nivasa', '#123d32', '#d7ff86')
  ON CONFLICT (organization_id) DO NOTHING;

  -- 3. Upsert domain mapping for pgflow-ruby.vercel.app using column "kind"
  INSERT INTO public.domain_mappings (
    id,
    organization_id,
    hostname,
    kind,
    state,
    verified_at
  ) VALUES (
    gen_random_uuid(),
    v_org_id,
    'pgflow-ruby.vercel.app',
    'platform_subdomain',
    'verified',
    now()
  )
  ON CONFLICT (hostname) DO UPDATE SET
    organization_id = EXCLUDED.organization_id,
    state = 'verified',
    verified_at = now();
END $$;
