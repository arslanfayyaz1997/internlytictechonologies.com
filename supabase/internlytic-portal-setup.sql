-- Internlytic portal setup (run in Supabase SQL Editor).
-- This adds portal tables and policies; it does NOT drop or replace existing certificate/offer-letter automation.

create table if not exists public.intern_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  instructions text not null,
  is_active boolean not null default true,
  created_by text,
  created_at timestamptz not null default now()
);

create table if not exists public.intern_task_submissions (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references public.intern_tasks(id) on delete set null,
  task_title text not null,
  intern_email text not null,
  intern_name text,
  certificate_id text,
  program text,
  description text not null,
  github_url text,
  linkedin_url text,
  other_links text,
  files jsonb not null default '[]'::jsonb,
  status text not null default 'submitted' check (status in ('submitted','under_review','approved','rejected')),
  completion_percent integer not null default 0 check (completion_percent in (0,100)),
  admin_feedback text,
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.intern_tasks enable row level security;
alter table public.intern_task_submissions enable row level security;
alter table public.certificates enable row level security;

-- Helper function used only by RLS. Change this email if your admin login is different.
create or replace function public.is_internlytic_admin()
returns boolean
language sql
stable
as $$
  select lower(coalesce(auth.jwt() ->> 'email', '')) = lower('arslanfayyaz1997@gmail.com');
$$;

-- Certificates: preserve existing policies; these add admin and intern access for authenticated portal sessions.
drop policy if exists "internlytic_admin_read_certificates" on public.certificates;
create policy "internlytic_admin_read_certificates"
on public.certificates for select to authenticated
using (public.is_internlytic_admin());

drop policy if exists "internlytic_intern_read_own_certificate" on public.certificates;
create policy "internlytic_intern_read_own_certificate"
on public.certificates for select to authenticated
using (lower(coalesce(student_email, '')) = lower(coalesce(auth.jwt() ->> 'email', '')));

-- Tasks: signed-in authorized interns can view active tasks; admin can manage tasks.
drop policy if exists "internlytic_read_active_tasks" on public.intern_tasks;
create policy "internlytic_read_active_tasks"
on public.intern_tasks for select to authenticated
using (is_active = true or public.is_internlytic_admin());

drop policy if exists "internlytic_admin_insert_tasks" on public.intern_tasks;
create policy "internlytic_admin_insert_tasks"
on public.intern_tasks for insert to authenticated
with check (public.is_internlytic_admin());

drop policy if exists "internlytic_admin_update_tasks" on public.intern_tasks;
create policy "internlytic_admin_update_tasks"
on public.intern_tasks for update to authenticated
using (public.is_internlytic_admin())
with check (public.is_internlytic_admin());

drop policy if exists "internlytic_admin_delete_tasks" on public.intern_tasks;
create policy "internlytic_admin_delete_tasks"
on public.intern_tasks for delete to authenticated
using (public.is_internlytic_admin());

-- Submissions: interns can create/read only their own submissions; only admin can read/update all submissions.
drop policy if exists "internlytic_intern_insert_own_submission" on public.intern_task_submissions;
create policy "internlytic_intern_insert_own_submission"
on public.intern_task_submissions for insert to authenticated
with check (
  lower(intern_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  and exists (
    select 1 from public.certificates c
    where lower(coalesce(c.student_email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
      and c.certificate_id = intern_task_submissions.certificate_id
  )
  and completion_percent = 0
  and status = 'submitted'
);

drop policy if exists "internlytic_intern_read_own_submissions" on public.intern_task_submissions;
create policy "internlytic_intern_read_own_submissions"
on public.intern_task_submissions for select to authenticated
using (lower(intern_email) = lower(coalesce(auth.jwt() ->> 'email', '')));

drop policy if exists "internlytic_admin_read_submissions" on public.intern_task_submissions;
create policy "internlytic_admin_read_submissions"
on public.intern_task_submissions for select to authenticated
using (public.is_internlytic_admin());

drop policy if exists "internlytic_admin_update_submissions" on public.intern_task_submissions;
create policy "internlytic_admin_update_submissions"
on public.intern_task_submissions for update to authenticated
using (public.is_internlytic_admin())
with check (public.is_internlytic_admin());

-- IMPORTANT: This script intentionally does not change existing certificate status/date columns,
-- create certificates, or send offer letters. Continue using your current manual/automated workflow.
