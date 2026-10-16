-- รันสคริปต์นี้ทั้งหมดใน Supabase SQL Editor ครั้งเดียวตอนตั้งค่าโปรเจกต์

create table if not exists users (
  user_id text primary key,
  target_weight numeric,
  start_weight numeric,
  start_date date,
  streak integer default 0,
  last_log_date date,
  height numeric,
  age integer,
  gender text,
  activity_level integer,
  program_start_date date,
  created_at timestamptz default now()
);

create table if not exists logs (
  id bigserial primary key,
  user_id text references users(user_id) on delete cascade,
  log_date date not null,
  weight numeric not null,
  created_at timestamptz default now(),
  unique (user_id, log_date)
);

create table if not exists measurements (
  id bigserial primary key,
  user_id text references users(user_id) on delete cascade,
  log_date date not null,
  waist numeric not null,
  created_at timestamptz default now(),
  unique (user_id, log_date)
);

create table if not exists photos (
  id bigserial primary key,
  user_id text references users(user_id) on delete cascade,
  log_date date not null,
  storage_path text not null,
  public_url text not null,
  created_at timestamptz default now(),
  unique (user_id, log_date)
);

create index if not exists logs_user_id_idx on logs(user_id);
create index if not exists measurements_user_id_idx on measurements(user_id);
create index if not exists photos_user_id_idx on photos(user_id);

-- ที่เก็บรูปความคืบหน้า (Supabase Storage) — bucket แบบ public เพราะรูปเข้าถึงได้เฉพาะคนมีลิงก์ตรงเท่านั้น (เดา URL ไม่ได้)
insert into storage.buckets (id, name, public)
values ('progress-photos', 'progress-photos', true)
on conflict (id) do nothing;

drop policy if exists "Public read progress photos" on storage.objects;
create policy "Public read progress photos"
  on storage.objects for select
  using (bucket_id = 'progress-photos');

-- ระบบแต้ม/เหรียญตราจากการเดิน: เป้าก้าวส่วนตัว (คำสั่ง "เป้าก้าว 8000") ไม่มีค่า = 6,000 ก้าว
alter table users add column if not exists step_goal integer;

-- แลกแต้มเป็นรางวัล (เจ้าของบอทเลี้ยง) status: pending = ยังไม่ได้เลี้ยง, done = เลี้ยงแล้ว
create table if not exists reward_redemptions (
  id bigserial primary key,
  user_id text references users(user_id) on delete cascade,
  reward text not null,
  points integer not null,
  status text not null default 'pending',
  created_at timestamptz default now(),
  fulfilled_at timestamptz
);
create index if not exists reward_redemptions_user_id_idx on reward_redemptions(user_id);
