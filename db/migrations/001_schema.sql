-- 001_schema.sql: Lehar HR core schema
-- Rule IDs refer to RESEARCH.md §9. Constraints here are the last line of defence;
-- the same rules are checked (with friendlier messages) in lib/core and lib/services.

do $$ begin create extension if not exists pgcrypto; exception when others then null; end $$;  -- optional: gen_random_uuid() is built in since PG13
create extension if not exists btree_gist;   -- exclusion constraint on leave ranges

-- ---------------------------------------------------------------- helpers
create schema if not exists app;

-- Today's date in IST, independent of server/session time zone (R-ATT-01)
create or replace function app.today_ist() returns date
language sql stable as $$ select (now() at time zone 'Asia/Kolkata')::date $$;

-- ---------------------------------------------------------------- reference tables
create table locations (
  id               smallint generated always as identity primary key,
  code             text not null unique check (code ~ '^[A-Z]{3}$'),
  name             text not null unique,
  city             text not null,
  state            text not null,
  -- 0 = Sunday … 6 = Saturday (R-ATT-02)
  weekly_off_days  smallint[] not null default '{0}'
    check (weekly_off_days <@ array[0,1,2,3,4,5,6]::smallint[])
);

create table departments (
  id    smallint generated always as identity primary key,
  name  text not null unique
);

-- ---------------------------------------------------------------- employees (R-EMP-*)
create sequence employee_code_seq start 1;

create table employees (
  id                     uuid primary key default gen_random_uuid(),
  employee_code          text not null unique
                           default ('KCF' || lpad(nextval('employee_code_seq')::text, 4, '0'))
                           check (employee_code ~ '^KCF[0-9]{4,}$'),
  clerk_user_id          text unique,
  email                  text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  full_name              text not null check (length(trim(full_name)) between 2 and 120),
  mobile                 text not null check (mobile ~ '^[6-9][0-9]{9}$'),            -- R-EMP-05
  dob                    date not null,
  gender                 text not null check (gender in ('Female','Male','Other')),
  date_of_joining        date not null,
  last_working_day       date,
  designation            text not null,
  department_id          smallint not null references departments(id),
  location_id            smallint not null references locations(id),
  reporting_manager_id   uuid references employees(id),
  salary_grade           text not null default 'G1',
  is_hr_admin            boolean not null default false,
  address_line1          text not null default '',
  address_line2          text not null default '',
  city                   text not null default '',
  state                  text not null default 'Goa',
  pincode                text not null check (pincode ~ '^[1-9][0-9]{5}$'),          -- R-EMP-06
  emergency_contact_name      text not null default '',
  emergency_contact_relation  text not null default '',
  emergency_contact_phone     text check (emergency_contact_phone is null or emergency_contact_phone ~ '^[6-9][0-9]{9}$'),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint employee_min_age_18 check (dob <= date_of_joining - interval '18 years'),  -- R-EMP-07
  constraint employee_not_own_manager check (reporting_manager_id is null or reporting_manager_id <> id), -- R-EMP-09
  constraint employee_lwd_after_doj check (last_working_day is null or last_working_day >= date_of_joining)
);
create unique index employees_email_lower_uk on employees (lower(email));
create index employees_manager_idx on employees (reporting_manager_id);

-- Employee code never changes (R-EMP-08)
create or replace function app.trg_employee_code_immutable() returns trigger
language plpgsql as $$
begin
  if new.employee_code is distinct from old.employee_code then
    raise exception 'Employee code cannot be changed (R-EMP-08)' using errcode = 'check_violation';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger trg_employee_code_immutable before update on employees
  for each row execute function app.trg_employee_code_immutable();

-- Employees are never deleted (R-EMP-13)
create or replace function app.trg_no_delete() returns trigger
language plpgsql as $$
begin
  raise exception 'Records in % are never deleted; set last_working_day instead (R-EMP-13)', tg_table_name
    using errcode = 'restrict_violation';
end $$;
create trigger trg_employees_no_delete before delete on employees
  for each row execute function app.trg_no_delete();

-- No reporting cycles: the new manager may not be the employee or anyone who reports
-- (directly or indirectly) to the employee (R-EMP-09)
create or replace function app.trg_no_reporting_cycle() returns trigger
language plpgsql as $$
declare
  found_cycle boolean;
begin
  if new.reporting_manager_id is null then return new; end if;
  with recursive chain(id, depth) as (
    select new.reporting_manager_id, 1
    union all
    select e.reporting_manager_id, c.depth + 1
    from employees e join chain c on e.id = c.id
    where e.reporting_manager_id is not null and c.depth < 100
  )
  select exists(select 1 from chain where id = new.id) into found_cycle;
  if found_cycle then
    raise exception 'Reporting cycle: this manager already reports to the employee (R-EMP-09)'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger trg_no_reporting_cycle before insert or update of reporting_manager_id on employees
  for each row execute function app.trg_no_reporting_cycle();

-- Statutory and bank: separate 1:1 tables so RLS can protect them independently of employees
create table employee_statutory (
  employee_id    uuid primary key references employees(id),
  pan            text not null unique check (pan ~ '^[A-Z]{5}[0-9]{4}[A-Z]$'),   -- R-EMP-01
  aadhaar        text not null check (aadhaar ~ '^[2-9][0-9]{11}$'),             -- R-EMP-02 / D2 (never selected by the app)
  aadhaar_last4  text generated always as (right(aadhaar, 4)) stored,
  uan            text unique check (uan is null or uan ~ '^[0-9]{12}$'),          -- R-EMP-03
  updated_at     timestamptz not null default now()
);

create table employee_bank (
  employee_id          uuid primary key references employees(id),
  account_number       text not null check (account_number ~ '^[0-9]{9,18}$'),
  account_last4        text generated always as (right(account_number, 4)) stored,
  ifsc                 text not null check (ifsc ~ '^[A-Z]{4}0[A-Z0-9]{6}$'),     -- R-EMP-04
  bank_name            text not null,
  account_holder_name  text not null,
  updated_at           timestamptz not null default now()
);

-- ---------------------------------------------------------------- holidays (R-ATT-09)
create table holidays (
  id           integer generated always as identity primary key,
  location_id  smallint not null references locations(id),
  date         date not null,
  name         text not null,
  type         text not null check (type in ('NATIONAL','STATE','OPTIONAL')),
  unique (location_id, date)
);

-- ---------------------------------------------------------------- attendance (R-ATT-*)
create table attendance (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null references employees(id),
  date         date not null,                    -- IST calendar date
  check_in     timestamptz,
  check_out    timestamptz,
  is_wfh       boolean not null default false,
  is_late      boolean not null default false,   -- computed in IST at write time (R-ATT-04)
  source       text not null default 'SELF' check (source in ('SELF','REGULARISATION','HR_CORRECTION','SEED')),
  updated_at   timestamptz not null default now(),
  unique (employee_id, date),                    -- R-ATT-03: one record per employee per day
  check (check_out is null or (check_in is not null and check_out > check_in))
);

create table regularisation_requests (
  id               uuid primary key default gen_random_uuid(),
  employee_id      uuid not null references employees(id),
  date             date not null,
  requested_in     timestamptz not null,
  requested_out    timestamptz not null,
  reason           text not null check (length(trim(reason)) >= 5),
  status           text not null default 'PENDING' check (status in ('PENDING','APPROVED','REJECTED','CANCELLED')),
  requested_by     uuid not null references employees(id),
  approver_id      uuid references employees(id),
  approver_comment text,
  decided_at       timestamptz,
  created_at       timestamptz not null default now(),
  check (requested_out > requested_in),
  check (approver_id is null or approver_id <> employee_id)   -- R-ATT-07: nobody approves their own
);
create unique index regularisation_one_pending_per_day
  on regularisation_requests (employee_id, date) where status = 'PENDING';

-- ---------------------------------------------------------------- leave (R-LV-*)
create table leave_types (
  id                        smallint generated always as identity primary key,
  code                      text not null unique check (code ~ '^[A-Z]{2,4}$'),
  name                      text not null,
  annual_quota              numeric(5,2),          -- null = unlimited (LOP) / per event
  accrual_method            text not null check (accrual_method in ('YEAR_START_PRORATED','MONTHLY','ON_REQUEST','NONE')),
  monthly_rate              numeric(4,2),          -- EL: 1.25
  carry_forward_max         numeric(5,2) not null default 0,
  half_day_allowed          boolean not null default false,
  requires_balance          boolean not null default true,
  counts_calendar_days      boolean not null default false,  -- Maternity (D-5)
  eligible_gender           text check (eligible_gender in ('Female','Male')),
  cert_required_after_days  numeric(4,1),          -- SL: 2 → certificate if days > 2 (R-LV-08)
  per_event_days            numeric(5,1),          -- ML 182, PL 5
  is_active                 boolean not null default true,
  sort_order                smallint not null default 0,
  check (accrual_method <> 'MONTHLY' or monthly_rate is not null)
);

create table leave_balances (
  id             uuid primary key default gen_random_uuid(),
  employee_id    uuid not null references employees(id),
  leave_type_id  smallint not null references leave_types(id),
  year           integer not null check (year between 2000 and 2100),
  opening        numeric(6,2) not null default 0 check (opening >= 0),   -- carried forward (EL)
  adjustment     numeric(6,2) not null default 0,                        -- HR manual +/- with audit
  unique (employee_id, leave_type_id, year)
);

create table leave_requests (
  id                uuid primary key default gen_random_uuid(),
  employee_id       uuid not null references employees(id),
  leave_type_id     smallint not null references leave_types(id),
  from_date         date not null,
  to_date           date not null,
  is_half_day       boolean not null default false,
  days              numeric(6,2) not null check (days > 0),
  paid_days         numeric(6,2) not null check (paid_days >= 0),
  lop_days          numeric(6,2) not null default 0 check (lop_days >= 0),
  reason            text not null check (length(trim(reason)) >= 3),
  status            text not null default 'PENDING' check (status in ('PENDING','APPROVED','REJECTED','CANCELLED')),
  approver_id       uuid references employees(id),
  approver_comment  text,
  decided_at        timestamptz,
  cancelled_at      timestamptz,
  applied_at        timestamptz not null default now(),
  check (to_date >= from_date),
  check (not is_half_day or from_date = to_date),                     -- R-LV-05
  check (paid_days + lop_days = days),                                -- R-LV-07
  check (approver_id is null or approver_id <> employee_id),          -- R-LV-11: never own
  -- R-LV-10: no overlapping active requests for the same employee
  constraint leave_no_overlap exclude using gist (
    employee_id with =,
    daterange(from_date, to_date, '[]') with &&
  ) where (status in ('PENDING','APPROVED'))
);
create index leave_requests_emp_idx on leave_requests (employee_id, from_date);
create index leave_requests_status_idx on leave_requests (status);

create table leave_attachments (
  id                uuid primary key default gen_random_uuid(),
  leave_request_id  uuid not null unique references leave_requests(id),
  file_name         text not null,
  mime_type         text not null check (mime_type in ('application/pdf','image/jpeg','image/png')),
  size_bytes        integer not null check (size_bytes > 0 and size_bytes <= 2097152),
  data              bytea not null,
  uploaded_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------- audit, agent, email, policy
create table audit_log (
  id                   bigint generated always as identity primary key,
  table_name           text not null,
  record_id            text not null,
  subject_employee_id  uuid references employees(id),
  action               text not null check (action in ('CREATE','UPDATE','REVEAL','DEACTIVATE','ATTENDANCE_CORRECTION','REGULARISATION_APPROVED','BALANCE_ADJUSTMENT','SETTINGS')),
  field                text,
  old_value            text,          -- statutory values are stored MASKED (R-EMP-12)
  new_value            text,
  reason               text,
  changed_by           uuid references employees(id),
  changed_at           timestamptz not null default now()
);
create index audit_log_subject_idx on audit_log (subject_employee_id, changed_at desc);
create trigger trg_audit_no_delete before delete on audit_log
  for each row execute function app.trg_no_delete();

create table agent_log (
  id           bigint generated always as identity primary key,
  employee_id  uuid not null references employees(id),
  request_id   uuid not null,                 -- groups the tool calls of one question
  tool         text not null,
  inputs       jsonb not null default '{}',
  result       jsonb,
  ok           boolean not null,
  created_at   timestamptz not null default now()
);
create index agent_log_emp_idx on agent_log (employee_id, created_at desc);

create table agent_drafts (
  id            uuid primary key default gen_random_uuid(),
  employee_id   uuid not null references employees(id),
  kind          text not null check (kind in ('LEAVE_REQUEST','HR_REMINDER_EMAIL')),
  payload       jsonb not null,
  status        text not null default 'DRAFT' check (status in ('DRAFT','CONFIRMED','DISCARDED')),
  result_ref    text,
  created_at    timestamptz not null default now(),
  decided_at    timestamptz
);

create table email_log (
  id           bigint generated always as identity primary key,
  to_email     text not null,
  subject      text not null,
  body         text not null,
  status       text not null check (status in ('SENT','SKIPPED','FAILED')),
  error        text,
  related_id   text,
  created_at   timestamptz not null default now()
);

create table policy_documents (
  id          smallint generated always as identity primary key,
  slug        text not null unique,
  title       text not null,
  body        text not null,
  updated_by  uuid references employees(id),
  updated_at  timestamptz not null default now()
);
