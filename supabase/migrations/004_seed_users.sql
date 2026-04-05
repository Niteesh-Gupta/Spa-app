-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 004: Seed complete Coloplast India user hierarchy
--
-- Password for all users: Password@123
-- Hash: $2a$10$JKpGdlK6RAI6ElKGI9hqfOEr47WIUL3Ox5F1byjZe2fQK65pAh8gO
--
-- Hierarchy:
--   CM (1) → NSM (1) → ZSM (4) → RSM (8) → TM (16)
--   Plus: TENDER_MANAGER (1), SUPPLY_CHAIN (1), FINANCE (1), ADMIN (1)
--   Total: 34 users
--
-- Zone → Region mapping:
--   North  : Delhi NCR | Uttar Pradesh
--   South  : Tamil Nadu | Andhra Pradesh
--   East   : West Bengal | Bihar
--   West   : Maharashtra | Gujarat
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO users (email, password_hash, name, role, zone, region, is_active)
VALUES

-- ── Cross-functional (no zone/region) ────────────────────────────────────────
('admin@coloplast.in',
 '$2a$10$JKpGdlK6RAI6ElKGI9hqfOEr47WIUL3Ox5F1byjZe2fQK65pAh8gO',
 'Admin User', 'ADMIN', NULL, NULL, TRUE),

('finance@coloplast.in',
 '$2a$10$JKpGdlK6RAI6ElKGI9hqfOEr47WIUL3Ox5F1byjZe2fQK65pAh8gO',
 'Anita Kapoor', 'FINANCE', NULL, NULL, TRUE),

('supplychain@coloplast.in',
 '$2a$10$JKpGdlK6RAI6ElKGI9hqfOEr47WIUL3Ox5F1byjZe2fQK65pAh8gO',
 'Ramesh Verma', 'SUPPLY_CHAIN', NULL, NULL, TRUE),

('rohan.mehta@coloplast.in',
 '$2a$10$JKpGdlK6RAI6ElKGI9hqfOEr47WIUL3Ox5F1byjZe2fQK65pAh8gO',
 'Rohan Mehta', 'TENDER_MANAGER', NULL, NULL, TRUE),

-- ── CM ───────────────────────────────────────────────────────────────────────
('vikram.kapoor@coloplast.in',
 '$2a$10$JKpGdlK6RAI6ElKGI9hqfOEr47WIUL3Ox5F1byjZe2fQK65pAh8gO',
 'Vikram Kapoor', 'CM', NULL, NULL, TRUE),

-- ── NSM ──────────────────────────────────────────────────────────────────────
('rajesh.sharma@coloplast.in',
 '$2a$10$JKpGdlK6RAI6ElKGI9hqfOEr47WIUL3Ox5F1byjZe2fQK65pAh8gO',
 'Rajesh Sharma', 'NSM', NULL, NULL, TRUE),

-- ── ZSMs (one per zone) ───────────────────────────────────────────────────────
('amit.singh@coloplast.in',
 '$2a$10$JKpGdlK6RAI6ElKGI9hqfOEr47WIUL3Ox5F1byjZe2fQK65pAh8gO',
 'Amit Singh', 'ZSM', 'North', NULL, TRUE),

('suresh.nair@coloplast.in',
 '$2a$10$JKpGdlK6RAI6ElKGI9hqfOEr47WIUL3Ox5F1byjZe2fQK65pAh8gO',
 'Suresh Nair', 'ZSM', 'South', NULL, TRUE),

('debashis.ghosh@coloplast.in',
 '$2a$10$JKpGdlK6RAI6ElKGI9hqfOEr47WIUL3Ox5F1byjZe2fQK65pAh8gO',
 'Debashis Ghosh', 'ZSM', 'East', NULL, TRUE),

('prashant.joshi@coloplast.in',
 '$2a$10$JKpGdlK6RAI6ElKGI9hqfOEr47WIUL3Ox5F1byjZe2fQK65pAh8gO',
 'Prashant Joshi', 'ZSM', 'West', NULL, TRUE),

-- ── RSMs (two per zone, each owns one region) ─────────────────────────────────
-- North
('neha.gupta@coloplast.in',
 '$2a$10$JKpGdlK6RAI6ElKGI9hqfOEr47WIUL3Ox5F1byjZe2fQK65pAh8gO',
 'Neha Gupta', 'RSM', 'North', 'Delhi NCR', TRUE),

('manish.tiwari@coloplast.in',
 '$2a$10$JKpGdlK6RAI6ElKGI9hqfOEr47WIUL3Ox5F1byjZe2fQK65pAh8gO',
 'Manish Tiwari', 'RSM', 'North', 'Uttar Pradesh', TRUE),

-- South
('kavitha.rajan@coloplast.in',
 '$2a$10$JKpGdlK6RAI6ElKGI9hqfOEr47WIUL3Ox5F1byjZe2fQK65pAh8gO',
 'Kavitha Rajan', 'RSM', 'South', 'Tamil Nadu', TRUE),

('kishore.reddy@coloplast.in',
 '$2a$10$JKpGdlK6RAI6ElKGI9hqfOEr47WIUL3Ox5F1byjZe2fQK65pAh8gO',
 'Kishore Reddy', 'RSM', 'South', 'Andhra Pradesh', TRUE),

-- East
('souvik.das@coloplast.in',
 '$2a$10$JKpGdlK6RAI6ElKGI9hqfOEr47WIUL3Ox5F1byjZe2fQK65pAh8gO',
 'Souvik Das', 'RSM', 'East', 'West Bengal', TRUE),

('pankaj.kumar@coloplast.in',
 '$2a$10$JKpGdlK6RAI6ElKGI9hqfOEr47WIUL3Ox5F1byjZe2fQK65pAh8gO',
 'Pankaj Kumar', 'RSM', 'East', 'Bihar', TRUE),

-- West
('priya.patil@coloplast.in',
 '$2a$10$JKpGdlK6RAI6ElKGI9hqfOEr47WIUL3Ox5F1byjZe2fQK65pAh8gO',
 'Priya Patil', 'RSM', 'West', 'Maharashtra', TRUE),

('rahul.shah@coloplast.in',
 '$2a$10$JKpGdlK6RAI6ElKGI9hqfOEr47WIUL3Ox5F1byjZe2fQK65pAh8gO',
 'Rahul Shah', 'RSM', 'West', 'Gujarat', TRUE),

-- ── TMs (two per region — same zone + region as their RSM) ───────────────────
-- North / Delhi NCR
('arjun.malik@coloplast.in',
 '$2a$10$JKpGdlK6RAI6ElKGI9hqfOEr47WIUL3Ox5F1byjZe2fQK65pAh8gO',
 'Arjun Malik', 'TM', 'North', 'Delhi NCR', TRUE),

('pooja.sharma@coloplast.in',
 '$2a$10$JKpGdlK6RAI6ElKGI9hqfOEr47WIUL3Ox5F1byjZe2fQK65pAh8gO',
 'Pooja Sharma', 'TM', 'North', 'Delhi NCR', TRUE),

-- North / Uttar Pradesh
('vivek.mishra@coloplast.in',
 '$2a$10$JKpGdlK6RAI6ElKGI9hqfOEr47WIUL3Ox5F1byjZe2fQK65pAh8gO',
 'Vivek Mishra', 'TM', 'North', 'Uttar Pradesh', TRUE),

('sunita.verma@coloplast.in',
 '$2a$10$JKpGdlK6RAI6ElKGI9hqfOEr47WIUL3Ox5F1byjZe2fQK65pAh8gO',
 'Sunita Verma', 'TM', 'North', 'Uttar Pradesh', TRUE),

-- South / Tamil Nadu
('arun.kumar@coloplast.in',
 '$2a$10$JKpGdlK6RAI6ElKGI9hqfOEr47WIUL3Ox5F1byjZe2fQK65pAh8gO',
 'Arun Kumar', 'TM', 'South', 'Tamil Nadu', TRUE),

('lakshmi.priya@coloplast.in',
 '$2a$10$JKpGdlK6RAI6ElKGI9hqfOEr47WIUL3Ox5F1byjZe2fQK65pAh8gO',
 'Lakshmi Priya', 'TM', 'South', 'Tamil Nadu', TRUE),

-- South / Andhra Pradesh
('satish.babu@coloplast.in',
 '$2a$10$JKpGdlK6RAI6ElKGI9hqfOEr47WIUL3Ox5F1byjZe2fQK65pAh8gO',
 'Satish Babu', 'TM', 'South', 'Andhra Pradesh', TRUE),

('swapna.rao@coloplast.in',
 '$2a$10$JKpGdlK6RAI6ElKGI9hqfOEr47WIUL3Ox5F1byjZe2fQK65pAh8gO',
 'Swapna Rao', 'TM', 'South', 'Andhra Pradesh', TRUE),

-- East / West Bengal
('sudipta.roy@coloplast.in',
 '$2a$10$JKpGdlK6RAI6ElKGI9hqfOEr47WIUL3Ox5F1byjZe2fQK65pAh8gO',
 'Sudipta Roy', 'TM', 'East', 'West Bengal', TRUE),

('ananya.bose@coloplast.in',
 '$2a$10$JKpGdlK6RAI6ElKGI9hqfOEr47WIUL3Ox5F1byjZe2fQK65pAh8gO',
 'Ananya Bose', 'TM', 'East', 'West Bengal', TRUE),

-- East / Bihar
('ravi.shankar@coloplast.in',
 '$2a$10$JKpGdlK6RAI6ElKGI9hqfOEr47WIUL3Ox5F1byjZe2fQK65pAh8gO',
 'Ravi Shankar', 'TM', 'East', 'Bihar', TRUE),

('priyanka.singh@coloplast.in',
 '$2a$10$JKpGdlK6RAI6ElKGI9hqfOEr47WIUL3Ox5F1byjZe2fQK65pAh8gO',
 'Priyanka Singh', 'TM', 'East', 'Bihar', TRUE),

-- West / Maharashtra
('swapnil.desai@coloplast.in',
 '$2a$10$JKpGdlK6RAI6ElKGI9hqfOEr47WIUL3Ox5F1byjZe2fQK65pAh8gO',
 'Swapnil Desai', 'TM', 'West', 'Maharashtra', TRUE),

('meera.joshi@coloplast.in',
 '$2a$10$JKpGdlK6RAI6ElKGI9hqfOEr47WIUL3Ox5F1byjZe2fQK65pAh8gO',
 'Meera Joshi', 'TM', 'West', 'Maharashtra', TRUE),

-- West / Gujarat
('harsh.patel@coloplast.in',
 '$2a$10$JKpGdlK6RAI6ElKGI9hqfOEr47WIUL3Ox5F1byjZe2fQK65pAh8gO',
 'Harsh Patel', 'TM', 'West', 'Gujarat', TRUE),

('nisha.modi@coloplast.in',
 '$2a$10$JKpGdlK6RAI6ElKGI9hqfOEr47WIUL3Ox5F1byjZe2fQK65pAh8gO',
 'Nisha Modi', 'TM', 'West', 'Gujarat', TRUE)

ON CONFLICT (email) DO UPDATE SET
  password_hash = EXCLUDED.password_hash,
  name          = EXCLUDED.name,
  role          = EXCLUDED.role,
  zone          = EXCLUDED.zone,
  region        = EXCLUDED.region,
  is_active     = EXCLUDED.is_active,
  updated_at    = NOW();
