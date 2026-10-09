import type { APIRoute } from 'astro';
import { createSupabaseServerClient } from '../../../lib/supabase';

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    const supabase = createSupabaseServerClient(cookies);
    
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized: Harap login terlebih dahulu.' }), { 
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const data = await request.json();

    if (!Array.isArray(data) || data.length === 0) {
      return new Response(JSON.stringify({ error: 'Payload tidak valid atau kosong.' }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const today = new Date().toISOString().split('T')[0];

    const mappedRows = data.map((row: any) => ({
      part: row['Part'],
      halaman: row['Halaman'],
      sensor_id: row['Sensor ID'],
      sensor_name: row['Sensor'],
      device: row['Device'],
      up_detik: row['Up (detik)'],
      down_detik: row['Down (detik)'],
      request_good: row['Request Good'],
      request_failed: row['Request Failed'],
      avg_total_mbit: row['Avg Total (Mbit/s)'],
      avg_in_mbit: row['Avg In (Mbit/s)'],
      avg_out_mbit: row['Avg Out (Mbit/s)'],
      volume_total_mb: row['Volume Total (MB)'],
      volume_in_mb: row['Volume In (MB)'],
      volume_out_mb: row['Volume Out (MB)'],
      max_mbit: row['Max (Mbit/s)'],
      min_mbit: row['Min (Mbit/s)'],
      status_cek: row['Cek'],
      import_date: today
    }));

    const { data: insertedData, error: dbError } = await supabase
      .from('prtg_sensor_reports')
      .insert(mappedRows)
      .select();

    if (dbError) throw dbError;

    return new Response(JSON.stringify({ inserted: insertedData.length }), { 
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
