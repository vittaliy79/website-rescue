-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New query)

-- Main CRM table
CREATE TABLE IF NOT EXISTS leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
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
  rescue_score integer DEFAULT 0
);

-- Analysis cache for Find Leads (persists scores between sessions)
CREATE TABLE IF NOT EXISTS place_analyses (
  place_id text PRIMARY KEY,
  company text,
  website_url text,
  analysis jsonb NOT NULL,
  rescue_score integer NOT NULL DEFAULT 0,
  analyzed_at timestamptz DEFAULT now()
);

-- Disable RLS for private single-user use
ALTER TABLE leads DISABLE ROW LEVEL SECURITY;
ALTER TABLE place_analyses DISABLE ROW LEVEL SECURITY;
