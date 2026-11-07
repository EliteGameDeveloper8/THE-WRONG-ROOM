-- THE WRONG ROOM · run once in Supabase SQL editor.
-- Also enable: Authentication > Providers > "Allow anonymous sign-ins".
-- Secrets (prv, rnd, votes) have RLS on and NO policies: clients can only reach them via the functions below.

create table rooms(code text primary key, phase text default 'lobby', step int default 0, sc int[], ends_at timestamptz,
  host uuid, qk boolean default false, res jsonb default '[]', ver int default 0);
create table players(code text references rooms on delete cascade, uid uuid, name text, ready boolean default false, seat int,
  primary key(code,uid));
create table prv(code text, uid uuid, role text, primary key(code,uid));
create table rnd(code text, uid uuid, step int, want int, ck text, ci int, truth int, primary key(code,uid,step));
create table votes(code text, uid uuid, step int, v int, primary key(code,uid,step));
alter table rooms enable row level security; alter table players enable row level security;
alter table prv enable row level security; alter table rnd enable row level security; alter table votes enable row level security;
create policy r_read on rooms for select using (true);
create policy p_read on players for select using (true);
alter publication supabase_realtime add table rooms, players;

create function mk(nm text, q boolean default false) returns text language plpgsql security definer set search_path=public as $$
declare c text; begin
  loop c:=upper(substr(md5(random()::text),1,5)); exit when not exists(select 1 from rooms where code=c); end loop;
  insert into rooms(code,host,qk) values(c,auth.uid(),q);
  insert into players(code,uid,name,seat) values(c,auth.uid(),left(coalesce(nullif(trim(nm),''),'Guest'),12),0);
  return c; end $$;

create function join_room(c text, nm text) returns void language plpgsql security definer set search_path=public as $$
declare r rooms; k int; begin
  select * into r from rooms where code=upper(c);
  if not found then raise exception 'No such room'; end if;
  if exists(select 1 from players where code=r.code and uid=auth.uid()) then return; end if;
  if r.phase<>'lobby' then raise exception 'That game already started'; end if;
  if (select count(*) from players where code=r.code)>=3 then raise exception 'Room is full'; end if;
  insert into players(code,uid,name,seat) values(r.code,auth.uid(),left(coalesce(nullif(trim(nm),''),'Guest'),12),
    (select coalesce(max(seat)+1,0) from players where code=r.code));
  update rooms set ver=ver+1 where code=r.code; end $$;

create function quick_play(nm text) returns text language plpgsql security definer set search_path=public as $$
declare c text; begin
  select r.code into c from rooms r where r.qk and r.phase='lobby' and (select count(*) from players p where p.code=r.code)<3
    and not exists(select 1 from players p where p.code=r.code and p.uid=auth.uid()) order by random() limit 1;
  if c is null then return mk(nm,true); end if;
  perform join_room(c,nm); return c; end $$;

create function leave_room(c text) returns void language plpgsql security definer set search_path=public as $$
begin
  delete from players where code=upper(c) and uid=auth.uid() and exists(select 1 from rooms where code=upper(c) and phase='lobby');
  update rooms set host=(select uid from players where code=upper(c) order by seat limit 1), ver=ver+1 where code=upper(c) and host=auth.uid();
  delete from rooms where code=upper(c) and phase='lobby' and not exists(select 1 from players where code=upper(c)); end $$;

create function set_ready(c text, rd boolean) returns void language plpgsql security definer set search_path=public as $$
begin update players set ready=rd where code=upper(c) and uid=auth.uid() and exists(select 1 from rooms where code=upper(c) and phase='lobby');
  update rooms set ver=ver+1 where code=upper(c); end $$;

-- Roles: 60% one saboteur, 40% none. Per situation each player gets a private "want" (gold star) and a clue.
-- Innocent clue: 60% true "NOT x", 25% true "it's x", 15% false "it's x". Saboteur clue: always false. Same wording, so nobody can tell.
create function start_game(c text) returns void language plpgsql security definer set search_path=public as $$
declare r rooms; ids uuid[]; e uuid; s int[]; u uuid; nn int; tr int; w int; x float; ck text; ci int; begin
  select * into r from rooms where code=upper(c) for update;
  if r.host<>auth.uid() or r.phase<>'lobby' then raise exception 'Only the host can start'; end if;
  select array_agg(uid order by seat) into ids from players where code=r.code and ready;
  if coalesce(array_length(ids,1),0)<>3 or (select count(*) from players where code=r.code)<>3 then raise exception 'Need 3 ready players'; end if;
  e:=case when random()<0.6 then ids[1+floor(random()*3)::int] end;
  select array_agg(g) into s from (select g from generate_series(0,4) g order by random() limit 3) q;
  delete from prv where code=r.code; delete from rnd where code=r.code; delete from votes where code=r.code;
  foreach u in array ids loop insert into prv values(r.code,u,case when u=e then 'enemy' else 'innocent' end); end loop;
  for i in 0..2 loop
    nn:=case when s[i+1]=0 then 4 else 3 end; tr:=floor(random()*nn)::int;
    foreach u in array ids loop
      w:=floor(random()*nn)::int; x:=random(); ck:='is'; ci:=(tr+1+floor(random()*(nn-1))::int)%nn;
      if u=e then if x<0.2 then ck:='not'; ci:=tr; end if;
      elsif x<0.6 then ck:='not'; elsif x<0.85 then ci:=tr; end if;
      insert into rnd values(r.code,u,i,w,ck,ci,tr);
    end loop;
  end loop;
  update rooms set phase='talk',step=0,sc=s,res='[]',ends_at=now()+interval '75 seconds',ver=ver+1 where code=r.code; end $$;

create function fin(c text) returns void language plpgsql security definer set search_path=public as $$
declare r rooms; o int; m int; begin
  select * into r from rooms where code=c;
  insert into votes select c,uid,r.step,-1 from players where code=c on conflict do nothing;
  select v,count(*) into o,m from votes where code=c and step=r.step and v>=0 group by v order by count(*) desc, random() limit 1;
  if m is null or m<2 then o:=-1; end if;
  update rooms set phase='result',ends_at=now()+interval '12 seconds',ver=ver+1,
    res=res||jsonb_build_array(jsonb_build_object('o',o,'t',(select truth from rnd where code=c and step=r.step limit 1),
      'v',(select jsonb_object_agg(uid::text,v) from votes where code=c and step=r.step))) where code=c; end $$;
revoke execute on function fin(text) from public, anon, authenticated;

create function vote(c text, x int) returns void language plpgsql security definer set search_path=public as $$
declare r rooms; begin
  select * into r from rooms where code=upper(c) for update;
  if r.phase<>'vote' or not exists(select 1 from players where code=r.code and uid=auth.uid()) then raise exception 'Voting is closed'; end if;
  if x<0 or x>=case when r.sc[r.step+1]=0 then 4 else 3 end then raise exception 'Bad option'; end if;
  insert into votes values(r.code,auth.uid(),r.step,x) on conflict do nothing;
  if (select count(*) from votes where code=r.code and step=r.step)>=3 then perform fin(r.code);
  else update rooms set ver=ver+1 where code=r.code; end if; end $$;

create function tick(c text) returns void language plpgsql security definer set search_path=public as $$
declare r rooms; begin
  select * into r from rooms where code=upper(c) for update;
  if r.phase in ('lobby','end') or now()<r.ends_at then return; end if;
  if r.phase='talk' then update rooms set phase='vote',ends_at=now()+interval '25 seconds',ver=ver+1 where code=r.code;
  elsif r.phase='vote' then perform fin(r.code);
  elsif r.step>=2 then update rooms set phase='end',ver=ver+1 where code=r.code;
  else update rooms set phase='talk',step=step+1,ends_at=now()+interval '75 seconds',ver=ver+1 where code=r.code; end if; end $$;

create function again(c text) returns void language plpgsql security definer set search_path=public as $$
begin
  if not exists(select 1 from rooms where code=upper(c) and phase='end') or not exists(select 1 from players where code=upper(c) and uid=auth.uid()) then return; end if;
  delete from prv where code=upper(c); delete from rnd where code=upper(c); delete from votes where code=upper(c);
  update players set ready=false where code=upper(c);
  update rooms set phase='lobby',step=0,res='[]',sc=null,ver=ver+1 where code=upper(c); end $$;

-- The ONLY read path for secrets: own role/clues, never anyone else's until the game ends. Truth is never sent until a step resolves (it lives in res).
create function get_state(c text) returns jsonb language plpgsql security definer set search_path=public as $$
declare r rooms; begin
  select * into r from rooms where code=upper(c);
  if not found then raise exception 'No such room'; end if;
  if not exists(select 1 from players where code=r.code and uid=auth.uid()) then raise exception 'Not in room'; end if;
  return jsonb_build_object('now',now(),'room',to_jsonb(r),'me',auth.uid(),
    'players',(select coalesce(jsonb_agg(jsonb_build_object('id',uid,'name',name,'ready',ready) order by seat),'[]'::jsonb) from players where code=r.code),
    'role',(select role from prv where code=r.code and uid=auth.uid()),
    'rnd',(select coalesce(jsonb_agg(jsonb_build_object('uid',x.uid,'step',x.step,'want',x.want,'ck',x.ck,'ci',x.ci)),'[]'::jsonb)
           from rnd x where x.code=r.code and (r.phase='end' or (x.uid=auth.uid() and x.step<=r.step))),
    'roles',case when r.phase='end' then (select jsonb_object_agg(uid::text,role) from prv where code=r.code) end,
    'voted',(select coalesce(jsonb_agg(uid),'[]'::jsonb) from votes where code=r.code and step=r.step)); end $$;
