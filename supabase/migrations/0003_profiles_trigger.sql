-- 0003_profiles_trigger.sql
-- Auto-create a public.profiles row whenever a new auth.users row is inserted,
-- so the app always has a profile to read for a signed-in user (PLAN.md §11.5).

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
