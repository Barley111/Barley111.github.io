-- 信号站 · 备考倒计时「云同步」建表脚本
-- 用法：Supabase 控制台 → 左侧 SQL Editor → 新建查询 → 粘贴本文件全部内容 → Run
-- 项目：signal-blog（与博客评论区同一个 Supabase 项目）

-- 1) 建表：一个同步码 = 一行，payload 存整份快照
create table if not exists public.countdown_state (
  code       text primary key,                 -- 同步码，如 SIG-8F3K-2QDP
  payload    jsonb not null,                   -- 考试/分数/打卡/页数/积分 整份快照
  updated_at timestamptz not null default now()
);

-- 2) 开 RLS，并只放开「按码读写」的最小权限
alter table public.countdown_state enable row level security;

drop policy if exists countdown_state_select on public.countdown_state;
drop policy if exists countdown_state_insert on public.countdown_state;
drop policy if exists countdown_state_update on public.countdown_state;

create policy countdown_state_select on public.countdown_state
  for select to anon using (true);

create policy countdown_state_insert on public.countdown_state
  for insert to anon with check (true);

create policy countdown_state_update on public.countdown_state
  for update to anon using (true) with check (true);

-- 3) 给匿名角色（前端 publishable key 对应的角色）授权
grant select, insert, update on public.countdown_state to anon;

-- 验证：应看到新建的表结构
select column_name, data_type from information_schema.columns
where table_schema = 'public' and table_name = 'countdown_state'
order by ordinal_position;
