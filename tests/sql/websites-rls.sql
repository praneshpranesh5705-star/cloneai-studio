-- RLS checks for the websites table. Run after schema.sql.
-- Every assertion raises an exception on failure, so a clean run means pass.
--
-- Note: `set local` only lasts for the current transaction, so each block that
-- switches identity is wrapped in begin/commit. Setting it outside a
-- transaction silently does nothing, which would make every check pass for the
-- wrong reason.

\set ON_ERROR_STOP on

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'alice@example.test'),
  ('22222222-2222-2222-2222-222222222222', 'bob@example.test')
on conflict (id) do nothing;

-- Alice creates a draft and a published page.
begin;
set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
insert into public.websites (owner_id, slug, title, html, published) values
  ('11111111-1111-1111-1111-111111111111', 'alice-draft', 'Alice Draft', '<html><body>draft</body></html>', false),
  ('11111111-1111-1111-1111-111111111111', 'alice-live', 'Alice Live', '<html><body>live</body></html>', true)
on conflict (slug) do nothing;
commit;

-- 1 & 2. Bob's view.
begin;
set local role authenticated;
set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
do $$
declare draft int; live int;
begin
  select count(*) into draft from public.websites where slug = 'alice-draft';
  select count(*) into live  from public.websites where slug = 'alice-live';
  if draft <> 0 then raise exception 'FAIL: Bob can read Alice''s draft (% rows)', draft; end if;
  raise notice 'PASS: Bob cannot read Alice''s draft';
  if live <> 1 then raise exception 'FAIL: Bob cannot read the published page (% rows)', live; end if;
  raise notice 'PASS: Bob can read the published page';
end $$;

-- 3. Bob cannot insert a page owned by Alice.
do $$
begin
  begin
    insert into public.websites (owner_id, slug, title, html)
    values ('11111111-1111-1111-1111-111111111111', 'bob-forged', 'Forged', '<html></html>');
    raise exception 'FAIL: Bob inserted a page owned by Alice';
  exception when insufficient_privilege then
    raise notice 'PASS: Bob cannot insert a page owned by Alice';
  end;
end $$;

-- 4. Bob cannot update Alice's page.
do $$
declare n int;
begin
  update public.websites set title = 'Hacked' where slug = 'alice-live';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: Bob updated % of Alice''s rows', n; end if;
  raise notice 'PASS: Bob cannot update Alice''s page';
end $$;

-- 5. Bob cannot delete Alice's page.
do $$
declare n int;
begin
  delete from public.websites where slug = 'alice-live';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: Bob deleted % of Alice''s rows', n; end if;
  raise notice 'PASS: Bob cannot delete Alice''s page';
end $$;
commit;

-- 6 & 7. An anonymous visitor.
begin;
set local role anon;
do $$
declare draft int; live int;
begin
  select count(*) into draft from public.websites where slug = 'alice-draft';
  select count(*) into live  from public.websites where slug = 'alice-live';
  if draft <> 0 then raise exception 'FAIL: anon can read a draft'; end if;
  if live <> 1 then raise exception 'FAIL: anon cannot read the published page'; end if;
  raise notice 'PASS: anon sees published pages only';
end $$;

do $$
begin
  begin
    insert into public.websites (owner_id, slug, title, html)
    values ('11111111-1111-1111-1111-111111111111', 'anon-page', 'Anon', '<html></html>');
    raise exception 'FAIL: anon inserted a page';
  exception when insufficient_privilege then
    raise notice 'PASS: anon cannot insert';
  end;
end $$;
commit;

-- 8. The slug format constraint rejects unsafe values.
do $$
begin
  begin
    insert into public.websites (owner_id, slug, title, html)
    values ('11111111-1111-1111-1111-111111111111', 'Bad Slug!', 'Bad', '<html></html>');
    raise exception 'FAIL: an unsafe slug was accepted';
  exception when check_violation then
    raise notice 'PASS: unsafe slug rejected by the constraint';
  end;
end $$;

-- 9. Slugs are unique.
do $$
begin
  begin
    insert into public.websites (owner_id, slug, title, html)
    values ('11111111-1111-1111-1111-111111111111', 'alice-live', 'Dup', '<html></html>');
    raise exception 'FAIL: duplicate slug accepted';
  exception when unique_violation then
    raise notice 'PASS: duplicate slug rejected';
  end;
end $$;

-- 10. Alice can still manage her own pages.
begin;
set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
do $$
declare n int;
begin
  update public.websites set title = 'Alice Live v2' where slug = 'alice-live';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: Alice could not update her own page'; end if;
  raise notice 'PASS: Alice can update her own page';
end $$;
commit;

select 'ALL WEBSITE RLS CHECKS PASSED' as result;
