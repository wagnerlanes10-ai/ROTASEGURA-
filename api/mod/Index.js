export const config = { runtime: 'edge' };
function safeEqual(a, b){ if (typeof a !== 'string' || typeof b !== 'string') return false; if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; }
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'Content-Type': 'application/json; charset=utf-8' } });

export default async function handler(req){
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_KEY, tok = process.env.MOD_TOKEN;
  if (!url || !key || !tok) return json({ ok:false, error:'painel não configurado' }, 503);
  const sent = req.headers.get('x-mod-token') || '';
  if (!safeEqual(sent, tok)) return json({ ok:false, error:'acesso negado' }, 401);
  const H = { apikey:key, Authorization:`Bearer ${key}`, 'Content-Type':'application/json', Prefer:'return=representation' };
  if (req.method === 'GET'){
    const q = 'select=id,lat,lng,type,severity_rep,severity_eff,radius_m,report_count,note,status,created_at,expires_at&status=in.(active,flagged)&order=created_at.desc&limit=500';
    const r = await fetch(`${url}/rest/v1/risk_reports?${q}`, { headers:H });
    const rows = await r.json().catch(()=>[]);
    return json({ ok:r.ok, rows:Array.isArray(rows)?rows:[] }, r.ok?200:502);
  }
  if (req.method === 'POST'){
    let b; try { b = await req.json(); } catch { return json({ ok:false, error:'json inválido' }, 400); }
    const id = Number(b.id);
    if (!Number.isInteger(id) || id <= 0) return json({ ok:false, error:'id inválido' }, 400);
    const action = b.action;
    let patch;
    if (action === 'extend') patch = { status:'active', expires_at:new Date(Date.now() + 6*3600e3).toISOString() };
    else if (action === 'remove') patch = { status:'removed' };
    else return json({ ok:false, error:'ação desconhecida' }, 400);
    const r = await fetch(`${url}/rest/v1/risk_reports?id=eq.${id}`, { method:'PATCH', headers:H, body:JSON.stringify(patch) });
    const rows = await r.json().catch(()=>[]);
    if (!r.ok || !Array.isArray(rows) || !rows.length) return json({ ok:false, error:'id inexistente ou falha', detail:rows }, r.ok?404:502);
    return json({ ok:true, action, row:rows[0] });
  }
  return json({ ok:false, error:'método não suportado' }, 405);
}
