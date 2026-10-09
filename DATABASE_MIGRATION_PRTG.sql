-- DATABASE_MIGRATION_PRTG.sql
CREATE TABLE public.prtg_sensor_reports (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    import_date DATE NOT NULL DEFAULT CURRENT_DATE,
    part NUMERIC,
    halaman NUMERIC,
    sensor_id NUMERIC NOT NULL,
    sensor_name TEXT,
    device TEXT,
    up_detik NUMERIC,
    down_detik NUMERIC,
    request_good NUMERIC,
    request_failed NUMERIC,
    avg_total_mbit NUMERIC,
    avg_in_mbit NUMERIC,
    avg_out_mbit NUMERIC,
    volume_total_mb NUMERIC,
    volume_in_mb NUMERIC,
    volume_out_mb NUMERIC,
    max_mbit NUMERIC,
    min_mbit NUMERIC,
    status_cek TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE public.prtg_sensor_reports ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Allow authenticated users to insert PRTG data
CREATE POLICY "Allow authenticated users to insert PRTG data"
ON public.prtg_sensor_reports
FOR INSERT
TO authenticated
WITH CHECK (true);

-- RLS Policy: Allow authenticated users to read PRTG data
CREATE POLICY "Allow authenticated users to read PRTG data"
ON public.prtg_sensor_reports
FOR SELECT
TO authenticated
USING (true);

-- B-Tree indexes for dashboard query performance
CREATE INDEX idx_prtg_sensor_date ON public.prtg_sensor_reports(import_date);
CREATE INDEX idx_prtg_sensor_id ON public.prtg_sensor_reports(sensor_id);
