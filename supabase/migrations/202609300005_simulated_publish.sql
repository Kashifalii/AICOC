create or replace function public.apply_approved_suggestion(
  target_suggestion uuid,
  target_batch uuid
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  item public.suggestions%rowtype;
  batch public.publish_batches%rowtype;
  before_text text;
begin
  select * into item from public.suggestions where id = target_suggestion for update;
  if not found then raise exception 'Suggestion not found'; end if;
  if not public.is_workspace_owner(item.workspace_id) then raise exception 'Workspace owner access required'; end if;
  if item.status <> 'approved' then raise exception 'Only approved suggestions may be published'; end if;
  select * into batch from public.publish_batches where id = target_batch for update;
  if not found or batch.workspace_id <> item.workspace_id or batch.mode not in ('simulated','shopify') then
    raise exception 'Invalid publish batch';
  end if;

  if item.field = 'title' then
    select title into before_text from public.products where id = item.product_id and workspace_id = item.workspace_id for update;
    update public.products set title = item.suggested_value where id = item.product_id and workspace_id = item.workspace_id;
  elsif item.field = 'description' then
    select description_html into before_text from public.products where id = item.product_id and workspace_id = item.workspace_id for update;
    update public.products set description_html = item.suggested_value where id = item.product_id and workspace_id = item.workspace_id;
  elsif item.field = 'seoTitle' then
    select seo_title into before_text from public.products where id = item.product_id and workspace_id = item.workspace_id for update;
    update public.products set seo_title = item.suggested_value where id = item.product_id and workspace_id = item.workspace_id;
  elsif item.field = 'seoDescription' then
    select seo_description into before_text from public.products where id = item.product_id and workspace_id = item.workspace_id for update;
    update public.products set seo_description = item.suggested_value where id = item.product_id and workspace_id = item.workspace_id;
  elsif item.field = 'images.alt' then
    select alt into before_text from public.product_images
      where product_id = item.product_id and workspace_id = item.workspace_id
      order by position asc limit 1 for update;
    update public.product_images set alt = item.suggested_value
      where id = (select id from public.product_images where product_id = item.product_id
        and workspace_id = item.workspace_id order by position asc limit 1);
  else
    raise exception 'Field is not supported for simulated publish';
  end if;
  if before_text is null then raise exception 'Product not found'; end if;

  insert into public.publish_items(workspace_id,batch_id,suggestion_id,before_value,after_value,result)
  values(item.workspace_id,target_batch,item.id,before_text,item.suggested_value,jsonb_build_object('mode',batch.mode));
  perform public.transition_suggestion(item.id,'published');
  return jsonb_build_object('suggestion_id',item.id,'product_id',item.product_id,'field',item.field,
    'before_value',before_text,'after_value',item.suggested_value,'status','published');
end;
$$;

revoke all on function public.apply_approved_suggestion(uuid,uuid) from public,anon;
grant execute on function public.apply_approved_suggestion(uuid,uuid) to authenticated;

create or replace function public.sync_job_total_from_progress()
returns trigger language plpgsql set search_path = public
as $$
begin
  if new.progress ? 'total' then
    new.total_items := greatest(0, (new.progress->>'total')::integer);
  end if;
  return new;
end;
$$;
create trigger jobs_sync_total before insert or update of progress on public.jobs
for each row execute function public.sync_job_total_from_progress();
