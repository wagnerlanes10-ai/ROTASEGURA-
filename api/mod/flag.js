export const config = { runtime: 'edge' };
async function sha256(s){ const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(s))); return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join(''); }
const json = (o,s=200)=>new Response(JSON.stringify(o),{status:s,headers:{'Content-Type':'application/json'}});

export default async function handler(req){
  if (req.method !== 'POST') return json({ok:false,error:'método'},405);
  let b; try { b = await req.json(); } catch { return json({ok:false,error:'json'},400); }
  const id = Number(b.id);
  if (!Number.isInteger(id) || id <= 0) return json({ok:false,error:'id inválido'},400);
  const devHash = b.device_id ? await sha256(b.device_id) : null;
  if (!devHash) return json({ok:false,error:'device_id obrigatório'},400);
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return json({ok:false,error:'banco não configurado'},503);
  try {
    const r = await fetch(`${url}/rest/v1/rpc/flag_report`, { method:'POST', headers:{ apikey:key, Authorization:`Bearer ${key}`, 'Content-Type':'application/json', Prefer:'return=representation' }, body: JSON.stringify({ p_id:id, p_device_hash:devHash }) });
    const rows = await r.json().catch(()=>[]);
    const row = Array.isArray(rows)?rows[0]:rows;
    if (!r.ok || !row) return json({ok:false,error:'falha rpc',detail:rows},502);
    return json({ ok:true, action:row.o_action, message:row.o_message });
  } catch(e){ return json({ok:false,error:'erro interno',detail:String(e)},500); }
}
