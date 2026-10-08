-- Supabase SQL Migration for Handovers Table
-- Run this script in Supabase SQL Editor: Project > SQL Editor > New Query
-- 
-- Steps:
-- 1. Copy this entire script
-- 2. Paste into Supabase SQL Editor
-- 3. Click "RUN"
-- 4. Wait for confirmation "Query successful"

-- Enable UUID extension (if not already enabled)
create extension if not exists "uuid-ossp";

-- Create handovers table
create table if not exists public.handovers (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  description text,
  status varchar(10) check (status in ('open', 'closed')) default 'open',
  shift_info varchar(100),
  created_at timestamptz default now(),
  created_by uuid references auth.users(id) on delete set null,
  closed_at timestamptz,
  closed_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz default now()
);

-- Create index on status for faster filtering
create index if not exists idx_handovers_status on public.handovers(status);
create index if not exists idx_handovers_created_at on public.handovers(created_at desc);

-- Enable Row Level Security (RLS)
alter table public.handovers enable row level security;

-- Drop existing policies if they exist
drop policy if exists "Allow authenticated users to read handovers" on public.handovers;
drop policy if exists "Allow authenticated users to insert handovers" on public.handovers;
drop policy if exists "Allow authenticated users to update handovers" on public.handovers;

-- Policy: Allow authenticated users to read handovers
create policy "Allow authenticated users to read handovers"
  on public.handovers for select
  to authenticated
  using (true);

-- Policy: Allow authenticated users to insert handovers
create policy "Allow authenticated users to insert handovers"
  on public.handovers for insert
  to authenticated
  with check (true);

-- Policy: Allow authenticated users to update handovers
create policy "Allow authenticated users to update handovers"
  on public.handovers for update
  to authenticated
  using (true);

-- Confirmation message
select 'Handovers table created successfully!' as status;
