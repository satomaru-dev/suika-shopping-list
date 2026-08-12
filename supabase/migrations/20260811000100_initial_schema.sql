create extension if not exists pgcrypto with schema extensions;

alter default privileges for role postgres in schema public revoke select, insert, update, delete on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke usage, select on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke execute on functions from public, anon, authenticated;

create table public.households (
  id uuid primary key default extensions.gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 50),
  pin_hash text not null,
  created_at timestamptz not null default now()
);

create table public.sessions (
  id uuid primary key default extensions.gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  token_hash text not null unique check (char_length(token_hash) = 64),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index sessions_household_id_idx on public.sessions(household_id);
create index sessions_expires_at_idx on public.sessions(expires_at);

create table public.login_attempts (
  id uuid primary key default extensions.gen_random_uuid(),
  ip_hash text not null check (char_length(ip_hash) = 64),
  success boolean not null default false,
  attempted_at timestamptz not null default now()
);
create index login_attempts_ip_time_idx on public.login_attempts(ip_hash, attempted_at desc) where success = false;

create table public.products (
  id uuid primary key default extensions.gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 100),
  normalized_name text not null check (char_length(normalized_name) between 1 and 100),
  created_at timestamptz not null default now(),
  unique (household_id, normalized_name)
);
create index products_household_id_idx on public.products(household_id);

create table public.product_aliases (
  id uuid primary key default extensions.gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  display_alias text not null,
  normalized_alias text not null,
  created_at timestamptz not null default now(),
  unique (household_id, normalized_alias)
);
create index product_aliases_product_id_idx on public.product_aliases(product_id);

create table public.import_batches (
  id uuid primary key default extensions.gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  source_name text not null,
  source_hash text not null,
  row_count integer not null default 0 check (row_count >= 0),
  created_at timestamptz not null default now(),
  unique (household_id, source_hash)
);
create index import_batches_household_id_idx on public.import_batches(household_id);

create table public.shopping_items (
  id uuid primary key default extensions.gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  original_name text not null check (char_length(original_name) between 1 and 100),
  source text not null default 'web' check (source in ('web', 'voice', 'siri', 'import', 'recommendation')),
  added_at timestamptz not null default now(),
  purchased_at timestamptz,
  import_batch_id uuid references public.import_batches(id) on delete restrict,
  import_row_number integer check (import_row_number is null or import_row_number > 0)
);
create index shopping_items_household_id_idx on public.shopping_items(household_id);
create index shopping_items_product_id_idx on public.shopping_items(product_id);
create index shopping_items_purchase_history_idx on public.shopping_items(household_id, product_id, purchased_at desc) where purchased_at is not null;
create unique index shopping_items_one_pending_product_idx on public.shopping_items(household_id, product_id) where purchased_at is null;
create unique index shopping_items_import_row_unique_idx on public.shopping_items(household_id, import_batch_id, import_row_number) where import_batch_id is not null;

create table public.siri_tokens (
  id uuid primary key default extensions.gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  label text not null check (char_length(label) between 1 and 50),
  token_hash text not null unique check (char_length(token_hash) = 64),
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
create index siri_tokens_household_id_idx on public.siri_tokens(household_id);
create index siri_tokens_active_hash_idx on public.siri_tokens(token_hash) where revoked_at is null;

alter table public.households enable row level security;
alter table public.sessions enable row level security;
alter table public.login_attempts enable row level security;
alter table public.products enable row level security;
alter table public.product_aliases enable row level security;
alter table public.import_batches enable row level security;
alter table public.shopping_items enable row level security;
alter table public.siri_tokens enable row level security;

revoke all on table public.households, public.sessions, public.login_attempts, public.products, public.product_aliases, public.import_batches, public.shopping_items, public.siri_tokens from anon, authenticated;
grant usage on schema public to service_role;
grant select, insert, update, delete on table public.households, public.sessions, public.login_attempts, public.products, public.product_aliases, public.import_batches, public.shopping_items, public.siri_tokens to service_role;

comment on table public.households is 'One shared household protected by an Argon2id PIN hash.';
comment on table public.shopping_items is 'Both pending items and immutable-style purchase history; purchased_at null means pending.';
comment on table public.siri_tokens is 'Revocable per-device Siri Shortcut tokens. Only SHA-256 hashes are stored.';
