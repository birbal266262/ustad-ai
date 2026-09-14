alter table public.crorepati_events alter column open_hour set default 6, alter column window_minutes set default 960;
update public.crorepati_events set open_hour = 6, window_minutes = 960 where open_hour = 18 and window_minutes = 240;
delete from public.crorepati_event_occurrences o
 where o.status = 'scheduled'
   and o.opened_at > now()
   and exists (select 1 from public.crorepati_events e where e.id = o.event_id);

CREATE TABLE IF NOT EXISTS public.device_ai_batches (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  guest_id UUID NOT NULL,
  task TEXT NOT NULL,
  raw TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS device_ai_batches_guest_task_idx ON public.device_ai_batches (guest_id, task, created_at DESC);
GRANT ALL ON public.device_ai_batches TO service_role;
ALTER TABLE public.device_ai_batches ENABLE ROW LEVEL SECURITY;