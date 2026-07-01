-- Bee Haven / LCFG Operating System — Supabase database setup.
-- One documents table, private per user (row-level security), with instant
-- email+password signup (no confirmation email). Claude Code applies this for you.

create table if not exists public.documents (
  user_id    uuid not null references auth.users(id) on delete cascade,
  doc_type   text not null,
  data       jsonb,
  updated_at timestamptz default now(),
  primary key (user_id, doc_type)
);

alter table public.documents enable row level security;

create policy "read own documents"   on public.documents for select using (auth.uid() = user_id);
create policy "insert own documents" on public.documents for insert with check (auth.uid() = user_id);
create policy "update own documents" on public.documents for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "delete own documents" on public.documents for delete using (auth.uid() = user_id);

-- Auto-confirm new signups so email+password works instantly (no confirmation email).
create or replace function public.sfb_auto_confirm()
returns trigger language plpgsql security definer as $$
begin
  new.email_confirmed_at = coalesce(new.email_confirmed_at, now());
  return new;
end; $$;

drop trigger if exists sfb_auto_confirm_trigger on auth.users;
create trigger sfb_auto_confirm_trigger
  before insert on auth.users for each row execute function public.sfb_auto_confirm();

-- Fallback if the auth.users trigger is blocked on your plan:
-- Supabase dashboard -> Authentication -> Providers -> Email -> turn OFF "Confirm email".
