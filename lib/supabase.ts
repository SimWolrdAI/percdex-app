import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

/*
 ╔══════════════════════════════════════════════════════════════╗
 ║  Run this SQL in your Supabase SQL Editor to create tables  ║
 ╚══════════════════════════════════════════════════════════════╝

-- Tokens table
CREATE TABLE IF NOT EXISTS tokens (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  mint        TEXT UNIQUE NOT NULL,
  name        TEXT NOT NULL,
  symbol      TEXT NOT NULL,
  description TEXT DEFAULT '',
  created_at  BIGINT NOT NULL,           -- unix ms
  signature   TEXT DEFAULT '',
  metadata_uri TEXT,
  image_url   TEXT,                       -- token image URL (IPFS / Pump.fun)
  percolator_slab TEXT,                   -- slab address if futures enabled
  matcher_ctx TEXT,
  creator     TEXT NOT NULL,              -- wallet pubkey
  inserted_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_tokens_mint ON tokens(mint);
CREATE INDEX IF NOT EXISTS idx_tokens_creator ON tokens(creator);
CREATE INDEX IF NOT EXISTS idx_tokens_percolator ON tokens(percolator_slab) WHERE percolator_slab IS NOT NULL;

-- Fundraises table
CREATE TABLE IF NOT EXISTS fundraises (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  token_mint  TEXT UNIQUE NOT NULL REFERENCES tokens(mint),
  goal_sol    DOUBLE PRECISION NOT NULL,
  created_at  BIGINT NOT NULL,           -- unix ms
  created_by  TEXT NOT NULL,             -- wallet pubkey
  enabled     BOOLEAN DEFAULT FALSE,
  enabled_by  TEXT,
  inserted_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fundraises_mint ON fundraises(token_mint);

-- Fundraise pledges table
CREATE TABLE IF NOT EXISTS fundraise_pledges (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  token_mint   TEXT NOT NULL REFERENCES tokens(mint),
  wallet       TEXT NOT NULL,
  amount       DOUBLE PRECISION NOT NULL,  -- SOL
  message      TEXT,
  pledged_at   BIGINT NOT NULL,            -- unix ms
  inserted_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(token_mint, wallet)               -- one pledge per wallet per fundraise
);

CREATE INDEX IF NOT EXISTS idx_pledges_mint ON fundraise_pledges(token_mint);

-- Enable Row Level Security but allow public read/write via anon key
-- (for a production app you'd want proper RLS policies)
ALTER TABLE tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE fundraises ENABLE ROW LEVEL SECURITY;
ALTER TABLE fundraise_pledges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read tokens"  ON tokens  FOR SELECT USING (true);
CREATE POLICY "Public insert tokens" ON tokens  FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update tokens" ON tokens  FOR UPDATE USING (true);

CREATE POLICY "Public read fundraises"  ON fundraises  FOR SELECT USING (true);
CREATE POLICY "Public insert fundraises" ON fundraises  FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update fundraises" ON fundraises  FOR UPDATE USING (true);

CREATE POLICY "Public read pledges"  ON fundraise_pledges  FOR SELECT USING (true);
CREATE POLICY "Public insert pledges" ON fundraise_pledges  FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update pledges" ON fundraise_pledges  FOR UPDATE USING (true);

*/

