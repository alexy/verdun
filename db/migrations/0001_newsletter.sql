create table if not exists newsletter_items (
  id text primary key,
  title text not null,
  source text not null,
  source_kind text not null,
  url text not null,
  published_at timestamptz not null,
  project text not null,
  topic text not null,
  summary text not null,
  why_it_matters text not null,
  tags text[] not null default '{}',
  score integer not null default 0,
  raw_json jsonb not null default '{}'::jsonb,
  inserted_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists newsletter_votes (
  item_id text primary key references newsletter_items(id) on delete cascade,
  vote smallint not null check (vote in (-1, 0, 1)),
  updated_at timestamptz not null default now()
);

create table if not exists newsletter_focuses (
  id uuid primary key default gen_random_uuid(),
  text text not null,
  scope text not null check (scope in ('this_week', 'ongoing')),
  created_at timestamptz not null default now()
);

create table if not exists newsletter_source_runs (
  source text primary key,
  kind text not null,
  status text not null check (status in ('ok', 'error', 'pending', 'skipped')),
  item_count integer not null default 0,
  message text not null default '',
  project_counts jsonb not null default '{}'::jsonb,
  collected_at timestamptz not null default now()
);

alter table newsletter_source_runs
  add column if not exists project_counts jsonb not null default '{}'::jsonb;

create index if not exists newsletter_items_rank_idx on newsletter_items (published_at desc, score desc);
create index if not exists newsletter_items_project_idx on newsletter_items (project);
create index if not exists newsletter_items_topic_idx on newsletter_items (topic);
create index if not exists newsletter_source_runs_status_idx on newsletter_source_runs (status, collected_at desc);
