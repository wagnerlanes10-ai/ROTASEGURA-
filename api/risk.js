export const config = { runtime: 'edge' };
const CACHE = 'public, s-maxage=120, stale-while-revalidate=600';

async function loadLocal(){
  try {
    const r = await fetch(new URL('../data/risk.geojson', import.meta.url), { cache:'no-store' });
    if (r.ok) return await r.json();
  } catch(e){}
  return { type:'FeatureCollection', properties:{ source:'nenhum arquivo', updated:null }, features:[] };
}

async function loadReports(){
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return [];
  try {
    const now = new Date().toISOString();
    const q = `select=id,lat,lng,type,severity_eff,radius_m,report_count,expires_at,flags,status&status=in.(active,flagged)&expires_at=gte.${now}&order=created_at.desc&limit=1000`;
    const r = await fetch(`${url}/rest/v1/risk_reports?${q}`, { headers:{ apikey:key, Authorization:`Bearer ${key}` }});
    if (!r.ok) return [];
    const rows = await r.json();
    return rows.map(x => ({ type:'Feature',
      properties:{ db_id:x.id, name:(x.type||'Reporte')+(x.report_count>1?` · ${x.report_count} reports`:''), level:x.severity_eff||'medio', radius_m:x.radius_m||200, source:'comunidade', valid_until:x.expires_at, reports:x.report_count||1, flags:x.flags||0, flagged:x.status==='flagged' },
      geometry:{ type:'Point', coordinates:[x.lng, x.lat] }}));
  } catch(e){ return []; }
}

export default async function handler(){
  const base = await loadLocal();
  const reports = await loadReports();
  const out = { type:'FeatureCollection', properties:{ source:base.properties?.source||'local', updated:new Date().toISOString(), merged_reports:reports.length }, features:[...(base.features||[]), ...reports] };
  return new Response(JSON.stringify(out), { headers:{ 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':CACHE, 'Access-Control-Allow-Origin':'*' } });
}
