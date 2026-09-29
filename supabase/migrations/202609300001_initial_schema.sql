create extension if not exists pgcrypto;

create type public.member_role as enum ('Owner','Editor','Reviewer','Viewer');
create type public.suggestion_status as enum ('draft','pending_review','approved','rejected','published','exported','failed','reverted');

create table public.workspaces (id uuid primary key default gen_random_uuid(), name text not null, plan text not null default 'demo', created_at timestamptz not null default now());
create table public.workspace_members (id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces on delete cascade, user_id uuid not null references auth.users on delete cascade, role public.member_role not null default 'Owner', created_at timestamptz not null default now(), unique(workspace_id,user_id));
create table public.stores (id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces on delete cascade, name text not null, type text not null check(type in ('shopify','csv','demo')), domain text, token_encrypted text, api_version text, created_at timestamptz not null default now());
create unique index stores_workspace_domain_idx on public.stores(workspace_id,domain) where domain is not null;
create table public.products (id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces on delete cascade, store_id uuid not null references public.stores on delete cascade, external_id text, handle text not null, title text not null, description_html text not null default '', seo_title text not null default '', seo_description text not null default '', category text, attributes jsonb not null default '{}', price numeric, sku text, tags text[] not null default '{}', gtin text, content_hash text not null, updated_at timestamptz not null default now(), unique(store_id,external_id));
create index products_store_external_idx on public.products(store_id,external_id);
create index products_content_hash_idx on public.products(content_hash);
create table public.product_images (id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces on delete cascade, product_id uuid not null references public.products on delete cascade, url text not null, alt text not null default '', position int not null default 0);
create table public.collections (id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces on delete cascade, store_id uuid not null references public.stores on delete cascade, handle text not null, title text not null);
create table public.product_collections (workspace_id uuid not null references public.workspaces on delete cascade, product_id uuid not null references public.products on delete cascade, collection_id uuid not null references public.collections on delete cascade, primary key(product_id,collection_id));
create table public.brand_voices (id uuid primary key default gen_random_uuid(), workspace_id uuid not null unique references public.workspaces on delete cascade, tone text not null default '', reading_level text not null default '', banned_words text[] not null default '{}', required_phrases text[] not null default '{}', samples text[] not null default '{}');
create table public.audits (id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces on delete cascade, store_id uuid not null references public.stores on delete cascade, rule_set_version text not null, scope jsonb not null default '{}', status text not null default 'queued', score_before numeric, score_after numeric, summary jsonb not null default '{}', created_at timestamptz not null default now());
create table public.audit_issues (id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces on delete cascade, audit_id uuid not null references public.audits on delete cascade, product_id uuid not null references public.products on delete cascade, rule_id text not null, category text not null, severity text not null, field text not null, evidence jsonb not null default '{}', impact numeric not null default 0);
create index audit_issues_audit_severity_idx on public.audit_issues(audit_id,severity);
create table public.suggestions (id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces on delete cascade, issue_id uuid references public.audit_issues on delete set null, product_id uuid not null references public.products on delete cascade, field text not null, current_value text not null default '', suggested_value text not null default '', status public.suggestion_status not null default 'draft', confidence numeric, model text, prompt_version text, score_delta numeric, version int not null default 1, parent_id uuid references public.suggestions, created_at timestamptz not null default now());
create index suggestions_workspace_status_idx on public.suggestions(workspace_id,status);
create table public.jobs (id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces on delete cascade, type text not null, status text not null default 'queued', cursor jsonb not null default '{}', progress jsonb not null default '{}', error jsonb, idempotency_key text not null, created_at timestamptz not null default now(), unique(workspace_id,idempotency_key));
create table public.ai_cache (cache_key text primary key, workspace_id uuid not null references public.workspaces on delete cascade, response jsonb not null, created_at timestamptz not null default now());
create table public.plan_limits (workspace_id uuid not null references public.workspaces on delete cascade, metric text not null, period date not null, used int not null default 0, limit_value int not null, primary key(workspace_id,metric,period));
create table public.usage_events (id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces on delete cascade, metric text not null, quantity int not null default 1, created_at timestamptz not null default now());
create table public.publish_batches (id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces on delete cascade, store_id uuid not null references public.stores on delete cascade, mode text not null, status text not null default 'queued', created_at timestamptz not null default now());
create table public.publish_items (id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces on delete cascade, batch_id uuid not null references public.publish_batches on delete cascade, suggestion_id uuid not null references public.suggestions on delete cascade, before_value text not null, after_value text not null, result jsonb not null default '{}');
create table public.activity_log (id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces on delete cascade, actor_id uuid references auth.users on delete set null, action text not null, entity text not null, meta jsonb not null default '{}', created_at timestamptz not null default now());

create or replace function public.transition_suggestion(target_id uuid, target_status public.suggestion_status)
returns public.suggestion_status language plpgsql security definer set search_path = public
as $$ declare item public.suggestions%rowtype; actor_role public.member_role; permitted boolean := false; begin
  select * into item from public.suggestions where id=target_id for update;
  if not found then raise exception 'Suggestion not found'; end if;
  select role into actor_role from public.workspace_members where workspace_id=item.workspace_id and user_id=auth.uid();
  if actor_role is null then raise exception 'Workspace access denied'; end if;
  permitted := case
    when item.status='draft' and target_status='pending_review' then actor_role in ('Owner','Editor')
    when item.status='pending_review' and target_status in ('approved','rejected') then actor_role in ('Owner','Reviewer')
    when item.status in ('failed','rejected') and target_status='pending_review' then actor_role in ('Owner','Editor')
    when item.status='approved' and target_status in ('published','exported') then (actor_role='Owner' or (target_status='exported' and actor_role='Editor'))
    when item.status='published' and target_status='reverted' then actor_role='Owner'
    else false end;
  if not permitted then raise exception 'Suggestion transition is not allowed for this role'; end if;
  update public.suggestions set status=target_status where id=target_id;
  return target_status;
end $$;

create or replace function public.guard_publish_item_approval()
returns trigger language plpgsql security definer set search_path = public
as $$ begin
  if not exists(select 1 from public.suggestions where id=new.suggestion_id and workspace_id=new.workspace_id and status='approved') then
    raise exception 'Only approved suggestions may be published';
  end if;
  return new;
end $$;
create trigger publish_items_require_approval before insert on public.publish_items for each row execute function public.guard_publish_item_approval();

create or replace function public.is_workspace_member(target_workspace uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.workspace_members where workspace_id=target_workspace and user_id=auth.uid()) $$;

create or replace function public.is_workspace_owner(target_workspace uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.workspace_members where workspace_id=target_workspace and user_id=auth.uid() and role='Owner') $$;

create or replace function public.bootstrap_workspace_for_user()
returns trigger language plpgsql security definer set search_path = public
as $$ declare new_workspace uuid; begin
  insert into public.workspaces(name,plan) values(coalesce(new.raw_user_meta_data->>'workspace_name','My Workspace'),'free') returning id into new_workspace;
  insert into public.workspace_members(workspace_id,user_id,role) values(new_workspace,new.id,'Owner');
  insert into public.plan_limits(workspace_id,metric,period,used,limit_value) values
    (new_workspace,'products',date_trunc('month',now())::date,0,100),
    (new_workspace,'audits',date_trunc('month',now())::date,0,20),
    (new_workspace,'ai',date_trunc('month',now())::date,0,200),
    (new_workspace,'ai_daily',now()::date,0,200),
    (new_workspace,'publishes',date_trunc('month',now())::date,0,20);
  return new;
end $$;
create trigger on_auth_user_created_workspace after insert on auth.users for each row execute function public.bootstrap_workspace_for_user();

create or replace function public.consume_workspace_usage(target_workspace uuid, target_metric text, amount int default 1)
returns boolean language plpgsql security definer set search_path = public
as $$ declare affected int; begin
  if not public.is_workspace_member(target_workspace) or amount < 1 then return false; end if;
  update public.plan_limits set used=used+amount where workspace_id=target_workspace and metric=target_metric and period=date_trunc('month',now())::date and used+amount<=limit_value;
  get diagnostics affected = row_count;
  if affected > 0 then insert into public.usage_events(workspace_id,metric,quantity) values(target_workspace,target_metric,amount); end if;
  return affected > 0;
end $$;

create or replace function public.consume_workspace_ai_usage(target_workspace uuid,target_user uuid)
returns boolean language plpgsql security definer set search_path = public
as $$ declare monthly_rows int; daily_rows int; begin
  if not exists(select 1 from public.workspace_members where workspace_id=target_workspace and user_id=target_user) then return false; end if;
  begin
    update public.plan_limits set used=used+1 where workspace_id=target_workspace and metric='ai' and period=date_trunc('month',now())::date and used<limit_value;
    get diagnostics monthly_rows = row_count;
    update public.plan_limits set used=used+1 where workspace_id=target_workspace and metric='ai_daily' and period=now()::date and used<limit_value;
    get diagnostics daily_rows = row_count;
    if monthly_rows=0 or daily_rows=0 then raise exception 'AI usage limit reached'; end if;
  exception when raise_exception then return false;
  end;
  insert into public.usage_events(workspace_id,metric,quantity) values(target_workspace,'ai',1),(target_workspace,'ai_daily',1);
  return true;
end $$;

do $$ declare t text; begin
  foreach t in array array['products','product_images','collections','product_collections','audits','audit_issues','suggestions','jobs','ai_cache','usage_events','publish_items','activity_log'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('create policy tenant_select on public.%I for select using (public.is_workspace_member(workspace_id))',t);
    execute format('create policy tenant_insert on public.%I for insert with check (public.is_workspace_member(workspace_id))',t);
    execute format('create policy tenant_update on public.%I for update using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id))',t);
    execute format('create policy tenant_delete on public.%I for delete using (public.is_workspace_member(workspace_id))',t);
  end loop;
end $$;
alter table public.workspace_members enable row level security;
create policy members_select on public.workspace_members for select using (public.is_workspace_member(workspace_id));
create policy members_insert on public.workspace_members for insert with check (public.is_workspace_owner(workspace_id));
create policy members_update on public.workspace_members for update using (public.is_workspace_owner(workspace_id)) with check (public.is_workspace_owner(workspace_id));
create policy members_delete on public.workspace_members for delete using (public.is_workspace_owner(workspace_id));
alter table public.plan_limits enable row level security;
create policy limits_select on public.plan_limits for select using (public.is_workspace_member(workspace_id));
alter table public.workspaces enable row level security;
create policy tenant_select on public.workspaces for select using (public.is_workspace_member(id));
create policy tenant_update on public.workspaces for update using (public.is_workspace_owner(id)) with check (public.is_workspace_owner(id));
alter table public.stores enable row level security;
create policy stores_select on public.stores for select using (public.is_workspace_member(workspace_id));
create policy stores_insert_owner on public.stores for insert with check (public.is_workspace_owner(workspace_id));
create policy stores_update_owner on public.stores for update using (public.is_workspace_owner(workspace_id)) with check (public.is_workspace_owner(workspace_id));
create policy stores_delete_owner on public.stores for delete using (public.is_workspace_owner(workspace_id));
alter table public.brand_voices enable row level security;
create policy brand_voice_select on public.brand_voices for select using (public.is_workspace_member(workspace_id));
create policy brand_voice_insert_owner on public.brand_voices for insert with check (public.is_workspace_owner(workspace_id));
create policy brand_voice_update_owner on public.brand_voices for update using (public.is_workspace_owner(workspace_id)) with check (public.is_workspace_owner(workspace_id));
alter table public.publish_batches enable row level security;
create policy publish_batches_select on public.publish_batches for select using (public.is_workspace_member(workspace_id));
create policy publish_batches_insert_owner on public.publish_batches for insert with check (public.is_workspace_owner(workspace_id));
create policy publish_batches_update_owner on public.publish_batches for update using (public.is_workspace_owner(workspace_id)) with check (public.is_workspace_owner(workspace_id));
create policy publish_batches_delete_owner on public.publish_batches for delete using (public.is_workspace_owner(workspace_id));
create or replace function public.require_draft_suggestion()
returns trigger language plpgsql set search_path = public
as $$ begin
  if new.status <> 'draft' then raise exception 'Suggestions must be created as drafts'; end if;
  if coalesce(auth.role(),'') <> 'service_role' and not exists(select 1 from public.workspace_members where workspace_id=new.workspace_id and user_id=auth.uid() and role in ('Owner','Editor')) then raise exception 'Only Owners and Editors may create suggestions'; end if;
  return new;
end $$;
create trigger suggestions_start_as_draft before insert on public.suggestions for each row execute function public.require_draft_suggestion();

revoke all on function public.consume_workspace_usage(uuid,text,int) from public;
grant execute on function public.consume_workspace_usage(uuid,text,int) to authenticated;
revoke all on function public.consume_workspace_ai_usage(uuid,uuid) from public,authenticated;
grant execute on function public.consume_workspace_ai_usage(uuid,uuid) to service_role;
revoke all on function public.transition_suggestion(uuid,public.suggestion_status) from public;
grant execute on function public.transition_suggestion(uuid,public.suggestion_status) to authenticated;
revoke insert,update,delete on all tables in schema public from anon,authenticated;
grant select on all tables in schema public to authenticated;
grant insert,update,delete on public.workspace_members to authenticated;
grant insert,update,delete on public.stores to authenticated;
grant update on public.workspaces to authenticated;
grant insert,update,delete on public.publish_batches to authenticated;
grant insert,update on public.brand_voices to authenticated;
