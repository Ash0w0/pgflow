-- Migration 0030: Map pgflow-ruby.vercel.app to primary production PG organization

DO $$
DECLARE
  v_org_id uuid;
  v_template_version_id uuid;
BEGIN
  -- 1. Resolve template version ID
  SELECT id INTO v_template_version_id FROM public.template_versions WHERE status = 'current' ORDER BY created_at DESC LIMIT 1;
  IF v_template_version_id IS NULL THEN
    SELECT id INTO v_template_version_id FROM public.template_versions ORDER BY created_at DESC LIMIT 1;
  END IF;
  IF v_template_version_id IS NULL THEN
    v_template_version_id := '00000000-0000-4000-8000-000000000100'::uuid;
  END IF;

  -- 2. Find existing organization from domain_mappings or organizations table
  SELECT organization_id INTO v_org_id FROM public.domain_mappings LIMIT 1;
  
  IF v_org_id IS NULL THEN
    SELECT id INTO v_org_id FROM public.organizations WHERE state != 'archived' ORDER BY created_at ASC LIMIT 1;
  END IF;

  IF v_org_id IS NULL THEN
    v_org_id := '00000000-0000-4000-8000-000000000001'::uuid;
    INSERT INTO public.organizations (id, template_version_id, name, slug, state)
    VALUES (v_org_id, v_template_version_id, 'Nivasa PG', 'nivasa-pg', 'core_ready')
    ON CONFLICT (id) DO NOTHING;
  END IF;

  -- 3. Update existing domain mapping if present, otherwise insert new mapping
  IF EXISTS (SELECT 1 FROM public.domain_mappings WHERE organization_id = v_org_id) THEN
    UPDATE public.domain_mappings
    SET hostname = 'pgflow-ruby.vercel.app', state = 'verified', verified_at = coalesce(verified_at, now())
    WHERE organization_id = v_org_id;
  ELSE
    INSERT INTO public.domain_mappings (
      id, organization_id, hostname, kind, state, verified_at
    ) VALUES (
      gen_random_uuid(), v_org_id, 'pgflow-ruby.vercel.app', 'platform_subdomain', 'verified', now()
    )
    ON CONFLICT (hostname) DO UPDATE SET state = 'verified', verified_at = coalesce(verified_at, now());
  END IF;
END $$;
