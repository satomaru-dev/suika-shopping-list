create table public.product_merge_history (
  id uuid primary key default extensions.gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  source_name text not null,
  target_name text not null,
  merged_at timestamptz not null default now()
);
create index product_merge_history_household_idx on public.product_merge_history(household_id, merged_at desc);
alter table public.product_merge_history enable row level security;
revoke all on table public.product_merge_history from anon, authenticated;
grant select, insert on table public.product_merge_history to service_role;
