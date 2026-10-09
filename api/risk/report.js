export const config = { runtime: 'edge' };
async function sha256(s){ const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(s))); return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join(''); }

export default async function handler(req){
  if (req.method !== 'POST') return new Response('method not allowed',{status:405});
  let b; try { b = await req.json(); } catch { return new Response('json inválido',{status:400}); }
  const lat = Number(b.lat), lng = Number(b.lng);
  if (!isFinite(lat) || !isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return new Response('coordenadas inválidas',{status:400});
  const sev = ['alto','medio','baixo'].includes(b.severity) ? b.severity : 'medio';
  const radius = Math.min(2000, Math.max(50, Number(b.radius_m) || 200));
  const type = String(b.type || 'Reporte de risco').slice(0,40);
  const note = String(b.note || '').slice(0,240);
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return new Response(JSON.stringify({ ok:false, error:'banco não configurado', row:{lat,lng,severity:sev,radius_m:radius,type} }), { status:501, headers:{'Content-Type':'application/json'} });
  const device_hash = b.device_id ? await sha256(b.device_id) : null;
  const ipRaw = (req.headers.get('x-forwarded-for')||'').split(',')[0].trim() || null;
  const ip_hash = ipRaw ? await sha256(ipRaw) : null;
  try {
    const r = await fetch(`${url}/rest/v1/rpc/report_risk`, { method:'POST', headers:{ apikey:key, Authorization:`Bearer ${key}`, 'Content-Type':'application/json', Prefer:'return=representation' }, body: JSON.stringify({ p_lat:lat, p_lng:lng, p_severity:sev, p_radius:radius, p_type:type, p_note:note, p_device_hash:device_hash, p_ip_hash:ip_hash }) });
    const rows = await r.json().catch(()=>[]);
    const row = Array.isArray(rows) ? rows[0] : rows;
    if (!r.ok || !row) return new Response(JSON.stringify({ ok:false, error:'falha no banco', detail:rows }), { status:502, headers:{'Content-Type':'application/json'} });
    if (row.o_action === 'rejected') return new Response(JSON.stringify({ ok:false, rejected:true, error:row.o_message }), { status:429, headers:{'Content-Type':'application/json'} });
    return new Response(JSON.stringify({ ok:true, id:row.o_id, action:row.o_action, severity:row.o_severity_eff, count:row.o_count, expires_at:row.o_expires_at }), { status:201, headers:{'Content-Type':'application/json'} });
  } catch (e) { return new Response(JSON.stringify({ ok:false, error:'erro interno', detail:String(e) }), { status:500, headers:{'Content-Type':'application/json'} }); }
}
