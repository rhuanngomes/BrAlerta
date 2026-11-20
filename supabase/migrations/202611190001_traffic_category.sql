alter table public.incidents
  drop constraint if exists incidents_category_cityviva_check;
alter table public.incidents
  add constraint incidents_category_cityviva_check
  check (category in ('STREETLIGHT', 'POTHOLE', 'FLOOD', 'SAFETY', 'TRAFFIC'));

alter table public.scene_objects
  drop constraint if exists scene_objects_model_type_cityviva_check;
alter table public.scene_objects
  add constraint scene_objects_model_type_cityviva_check
  check (model_type in ('STREETLIGHT', 'POTHOLE', 'FLOOD', 'SAFETY', 'TRAFFIC'));

create or replace function public.create_incident_with_scene(
  p_category text,
  p_title text,
  p_description text,
  p_latitude double precision,
  p_longitude double precision,
  p_address text default null,
  p_photo_path text default null
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  new_incident_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_category is null or p_category not in ('STREETLIGHT', 'POTHOLE', 'FLOOD', 'SAFETY', 'TRAFFIC') then
    raise exception 'Invalid category';
  end if;
  if p_latitude not between -90 and 90 or p_longitude not between -180 and 180 then
    raise exception 'Invalid coordinates';
  end if;
  if char_length(trim(coalesce(p_title, ''))) not between 1 and 80 then
    raise exception 'Title must contain between 1 and 80 characters';
  end if;
  if char_length(trim(coalesce(p_description, ''))) not between 1 and 2000 then
    raise exception 'Description must contain between 1 and 2000 characters';
  end if;
  if p_photo_path is not null and split_part(p_photo_path, '/', 1) <> auth.uid()::text then
    raise exception 'Invalid photo owner';
  end if;

  insert into public.incidents (
    user_id, category, title, description, latitude, longitude, address, status, photo_path
  ) values (
    auth.uid(), p_category, trim(p_title), trim(p_description), p_latitude, p_longitude,
    nullif(trim(p_address), ''), 'PENDING', p_photo_path
  ) returning id into new_incident_id;

  insert into public.scene_objects (
    incident_id, model_type, latitude, longitude, altitude, rotation, scale
  ) values (
    new_incident_id, p_category, p_latitude, p_longitude, 0, 0, 1
  );

  insert into public.incident_history (
    incident_id, previous_status, new_status, changed_by, event_type
  ) values (
    new_incident_id, null, 'PENDING', auth.uid(), 'CREATED'
  );

  return new_incident_id;
end;
$$;

create or replace function public.update_own_pending_incident(
  p_incident_id uuid,
  p_category text,
  p_title text,
  p_description text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_incident public.incidents%rowtype;
  clean_title text := trim(coalesce(p_title, ''));
  clean_description text := trim(coalesce(p_description, ''));
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_category is null or p_category not in ('STREETLIGHT', 'POTHOLE', 'FLOOD', 'SAFETY', 'TRAFFIC') then
    raise exception 'Invalid category';
  end if;
  if char_length(clean_title) not between 1 and 80 then
    raise exception 'Title must contain between 1 and 80 characters';
  end if;
  if char_length(clean_description) not between 1 and 2000 then
    raise exception 'Description must contain between 1 and 2000 characters';
  end if;

  select * into current_incident
  from public.incidents
  where id = p_incident_id
  for update;

  if not found or current_incident.user_id <> auth.uid() then
    raise exception 'Incident not found';
  end if;
  if current_incident.status <> 'PENDING' then
    raise exception 'Only pending incidents can be edited';
  end if;

  if current_incident.category = p_category
    and current_incident.title = clean_title
    and current_incident.description = clean_description then
    return;
  end if;

  update public.incidents
  set category = p_category,
      title = clean_title,
      description = clean_description,
      updated_at = now()
  where id = p_incident_id;

  update public.scene_objects
  set model_type = p_category
  where incident_id = p_incident_id;

  insert into public.incident_history (
    incident_id, previous_status, new_status, changed_by, event_type
  ) values (
    p_incident_id, current_incident.status, current_incident.status, auth.uid(), 'DETAILS_UPDATED'
  );
end;
$$;
