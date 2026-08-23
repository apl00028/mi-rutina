create table if not exists public.nutrition_meal_completions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id uuid not null references public.nutrition_plans(id) on delete cascade,
  meal_date date not null,
  meal_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, plan_id, meal_id)
);

create index if not exists nutrition_meal_completions_user_plan_date_idx
  on public.nutrition_meal_completions (
    user_id,
    plan_id,
    meal_date
  );

alter table public.nutrition_meal_completions
  enable row level security;

create policy "Users can read own nutrition meal completions"
on public.nutrition_meal_completions
for select
using (
  auth.uid() = user_id
  and exists (
    select 1
    from public.nutrition_plans p
    where p.id = plan_id
      and p.user_id = auth.uid()
  )
);

create policy "Users can insert own nutrition meal completions"
on public.nutrition_meal_completions
for insert
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.nutrition_plans p
    where p.id = plan_id
      and p.user_id = auth.uid()
  )
);

create policy "Users can update own nutrition meal completions"
on public.nutrition_meal_completions
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can delete own nutrition meal completions"
on public.nutrition_meal_completions
for delete
using (auth.uid() = user_id);
