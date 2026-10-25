-- 002_rls.sql: Row-level security (ARCHITECTURE.md §4.3)
-- On Supabase, roles anon/authenticated and auth.jwt() already exist.
-- Locally (plain Postgres for tests) we create compatible stand-ins.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
end $$;

create schema if not exists auth;
do $$
begin
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'auth' and p.proname = 'jwt'
  ) then
    -- Same behaviour as Supabase's auth.jwt(): claims of the current request
    execute $f$
      create function auth.jwt() returns jsonb language sql stable as
      $b$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $b$
    $f$;
  end if;
end $$;

-- Let the server's login role switch into "authenticated" for RLS-checked reads (withRls)
do $$
begin
  execute format('grant authenticated to %I', current_user);
exception when others then null;  -- already granted / not permitted on managed hosts
end $$;

grant usage on schema app to authenticated;
do $$ begin
  execute 'grant usage on schema auth to authenticated';
exception when others then null;  -- Supabase already grants this; we may not own the schema
end $$;

-- Who is calling? (SECURITY DEFINER so the lookup itself is not blocked by RLS)
create or replace function app.current_employee_id() returns uuid
language sql stable security definer set search_path = public, app as $$
  select e.id from employees e
  where lower(e.email) = lower(auth.jwt() ->> 'email')
    and (e.last_working_day is null or e.last_working_day >= app.today_ist())
$$;

create or replace function app.is_hr_admin() returns boolean
language sql stable security definer set search_path = public, app as $$
  select coalesce((select e.is_hr_admin from employees e where e.id = app.current_employee_id()), false)
$$;

create or replace function app.is_direct_report(target uuid) returns boolean
language sql stable security definer set search_path = public, app as $$
  select exists (select 1 from employees e where e.id = target and e.reporting_manager_id = app.current_employee_id())
$$;

grant execute on function app.current_employee_id(), app.is_hr_admin(), app.is_direct_report(uuid), app.today_ist() to authenticated;

-- Enable RLS on every table. anon gets no policies → no access at all.
alter table locations               enable row level security;
alter table departments             enable row level security;
alter table employees               enable row level security;
alter table employee_statutory      enable row level security;
alter table employee_bank           enable row level security;
alter table holidays                enable row level security;
alter table attendance              enable row level security;
alter table regularisation_requests enable row level security;
alter table leave_types             enable row level security;
alter table leave_balances          enable row level security;
alter table leave_requests          enable row level security;
alter table leave_attachments       enable row level security;
alter table audit_log               enable row level security;
alter table agent_log               enable row level security;
alter table agent_drafts            enable row level security;
alter table email_log               enable row level security;
alter table policy_documents        enable row level security;

-- Supabase grants ALL on public tables to anon/authenticated by default. Start from zero,
-- then grant back only what the policies below need.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- Sensitive tables: owner or HR only, read-only for the authenticated role
grant select (employee_id, pan, aadhaar_last4, uan, updated_at) on employee_statutory to authenticated;
-- NOTE: column "aadhaar" is deliberately NOT granted → even HR cannot select the full number via RLS path
create policy statutory_owner_or_hr on employee_statutory for select to authenticated
  using (employee_id = app.current_employee_id() or app.is_hr_admin());

grant select (employee_id, account_number, account_last4, ifsc, bank_name, account_holder_name, updated_at)
  on employee_bank to authenticated;
create policy bank_owner_or_hr on employee_bank for select to authenticated
  using (employee_id = app.current_employee_id() or app.is_hr_admin());

-- Operational tables: self, direct reports, or HR (read-only)
grant select on employees, attendance, leave_requests, regularisation_requests to authenticated;
create policy employees_visible on employees for select to authenticated
  using (id = app.current_employee_id() or reporting_manager_id = app.current_employee_id() or app.is_hr_admin());
create policy attendance_visible on attendance for select to authenticated
  using (employee_id = app.current_employee_id() or app.is_direct_report(employee_id) or app.is_hr_admin());
create policy leave_visible on leave_requests for select to authenticated
  using (employee_id = app.current_employee_id() or app.is_direct_report(employee_id) or app.is_hr_admin());
create policy regularisation_visible on regularisation_requests for select to authenticated
  using (employee_id = app.current_employee_id() or app.is_direct_report(employee_id) or app.is_hr_admin());
