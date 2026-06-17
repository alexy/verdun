create or replace view workbench_records as
select
  'garbage'::text as instance,
  i.id,
  i.title,
  i.url,
  i.source,
  i.source_kind,
  i.published_at as observed_at,
  i.project as subject,
  i.topic,
  i.summary,
  i.tags,
  i.score,
  coalesce(v.vote, 0)::smallint as review,
  i.raw_json->'provenance' as provenance_json,
  jsonb_build_object(
    'project', i.project,
    'why_it_matters', i.why_it_matters
  ) as normalized_json,
  i.raw_json,
  i.updated_at
from newsletter_items i
left join newsletter_votes v on v.item_id = i.id;

create or replace view workbench_source_runs as
select
  'garbage'::text as instance,
  source,
  kind,
  status,
  item_count,
  message,
  project_counts as subject_counts,
  collected_at
from newsletter_source_runs;

create or replace view workbench_collection_plans as
select
  'garbage'::text as instance,
  project as subject,
  topic,
  hacker_news_query as query,
  live_terms,
  dev_to_tags as tags,
  review_targets,
  focus_terms,
  updated_at
from newsletter_query_plans;

create or replace view workbench_review_state as
select
  'garbage'::text as instance,
  item_id as record_id,
  vote as review,
  updated_at
from newsletter_votes;

create or replace view workbench_focuses as
select
  'garbage'::text as instance,
  id::text,
  text,
  scope,
  created_at
from newsletter_focuses;
