-- Run this in the Supabase SQL Editor (Dashboard -> SQL Editor -> New query)

CREATE TABLE IF NOT EXISTS wr_leads (
  id uuid PRIMARY KEY,
  company text NOT NULL DEFAULT '',
  niche text DEFAULT '',
  city text DEFAULT '',
  website text DEFAULT '',
  contact_name text DEFAULT '',
  email text DEFAULT '',
  phone text DEFAULT '',
  status text DEFAULT 'New',
  value integer DEFAULT 2500,
  notes text DEFAULT '',
  created_at text DEFAULT '',
  issues jsonb NOT NULL DEFAULT '{"mobile":false,"slow":false,"dated":false,"noCta":false,"noBooking":false,"noSsl":false}',
  place_id text,
  formatted_address text,
  google_maps_url text,
  website_url text,
  rating numeric,
  review_count integer,
  analysis jsonb,
  analyzed_at text,
  rescue_score integer DEFAULT 0,
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wr_place_analyses (
  place_id text PRIMARY KEY,
  company text,
  website_url text,
  analysis jsonb NOT NULL,
  rescue_score integer NOT NULL DEFAULT 0,
  analyzed_at timestamptz DEFAULT now()
);

ALTER TABLE wr_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE wr_place_analyses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_all_wr_leads" ON wr_leads;
CREATE POLICY "allow_all_wr_leads"
ON wr_leads
FOR ALL
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "allow_all_wr_place_analyses" ON wr_place_analyses;
CREATE POLICY "allow_all_wr_place_analyses"
ON wr_place_analyses
FOR ALL
USING (true)
WITH CHECK (true);
