CREATE TABLE public.phone_presence (
  user_id uuid PRIMARY KEY,
  pairing_code text NOT NULL,
  heartbeat_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.phone_presence TO authenticated;
GRANT ALL ON public.phone_presence TO service_role;
ALTER TABLE public.phone_presence ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their own phone presence" ON public.phone_presence
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
CREATE INDEX phone_presence_heartbeat_idx ON public.phone_presence (heartbeat_at);