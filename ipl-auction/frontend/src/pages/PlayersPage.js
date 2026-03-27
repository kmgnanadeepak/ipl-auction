import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { playersAPI, formatPrice } from '../utils/api';
import { Search, ChevronDown, Globe2, Star, ArrowLeft } from 'lucide-react';

const roleColors = {
  Batsman:     'bg-blue-500/10 text-blue-400 border-blue-500/30',
  Bowler:      'bg-red-500/10 text-red-400 border-red-500/30',
  'All-rounder':'bg-green-500/10 text-green-400 border-green-500/30',
  Wicketkeeper:'bg-purple-500/10 text-purple-400 border-purple-500/30',
};
const statusBadge = {
  available:  'bg-gray-700 text-gray-400',
  in_auction: 'bg-yellow-500/10 text-yellow-400 animate-pulse',
  sold:       'bg-green-500/10 text-green-400',
  unsold:     'bg-red-500/10 text-red-400',
};

export default function PlayersPage() {
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search,  setSearch]  = useState('');
  const [role,    setRole]    = useState('all');
  const [status,  setStatus]  = useState('all');
  const [sel,     setSel]     = useState(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = { limit: 311 };
      if (role   !== 'all') params.role   = role;
      if (status !== 'all') params.status = status;
      if (search)           params.search = search;
      const { data } = await playersAPI.getAll(params);
      console.log('[PlayersPage] /api/players response', data);
      setPlayers(data.players || []);
    } catch (err) {
      console.error('[PlayersPage] fetch error', err);
      setPlayers([]);
      setError(err.response?.data?.message || 'Failed to load players from API');
    } finally { setLoading(false); }
  }, [role, status, search]);

  useEffect(() => { const t = setTimeout(fetch, 280); return () => clearTimeout(t); }, [fetch]);

  return (
    <div className="min-h-screen bg-ipl-dark">
      <header className="sticky top-0 z-40 bg-gray-900/95 backdrop-blur border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center gap-3">
          <Link to="/auction" className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors">
            <ArrowLeft className="w-5 h-5"/>
          </Link>
          <h1 className="font-display font-bold text-white text-xl">Player Pool</h1>
          <span className="text-gray-600 text-sm">{players.length} players</span>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-5">
        {/* filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-5">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500"/>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search player, country or IPL team…"
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-gray-800 border border-gray-700 text-white text-sm focus:outline-none focus:border-yellow-500"/>
          </div>
          {[
            { val:role,   set:setRole,   opts:['all','Batsman','Bowler','All-rounder','Wicketkeeper'] },
            { val:status, set:setStatus, opts:['all','available','sold','unsold','in_auction'] },
          ].map(({val,set,opts},i) => (
            <div key={i} className="relative">
              <select value={val} onChange={e=>set(e.target.value)}
                className="pl-4 pr-9 py-2.5 rounded-xl bg-gray-800 border border-gray-700 text-white text-sm focus:outline-none focus:border-yellow-500 appearance-none">
                {opts.map(o=><option key={o} value={o}>{o==='all'?`All ${i===0?'Roles':'Status'}`:o}</option>)}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none"/>
            </div>
          ))}
        </div>

        {/* table */}
        {loading
          ? <div className="flex items-center justify-center h-48"><div className="w-8 h-8 border-4 border-yellow-500/20 border-t-yellow-500 rounded-full animate-spin"/></div>
          : (
            <div className="ipl-card overflow-hidden">
              {error && (
                <div className="px-4 py-3 text-sm text-red-400 border-b border-red-500/20 bg-red-500/10">
                  {error}
                </div>
              )}
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800">
                    {['#','Player','Role','IPL Team','Country','Base Price','Status','Sold For'].map(h=>(
                      <th key={h} className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {players.map((p,i)=>(
                    <tr key={p._id} onClick={()=>setSel(p)}
                      className="border-b border-gray-800/40 hover:bg-gray-800/30 cursor-pointer transition-colors">
                      <td className="px-4 py-3 text-gray-600 text-xs">{i+1}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <img src={p.image||`https://placehold.co/36x36/1F2937/white?text=${p.name?.[0]}`}
                            className="w-9 h-9 rounded-lg object-cover flex-shrink-0"
                            onError={e=>{e.target.src=`https://placehold.co/36x36/1F2937/white?text=${p.name?.[0]}`;}} alt=""/>
                          <div>
                            <div className="flex items-center gap-1">
                              <span className="font-display font-bold text-white">{p.name}</span>
                              {p.isCapped   && <Star   className="w-3 h-3 text-yellow-400 fill-yellow-400"/>}
                              {p.isOverseas && <Globe2 className="w-3 h-3 text-blue-400"/>}
                            </div>
                            <p className="text-xs text-gray-500">{p.iplTeam || 'Did Not Play'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-bold border ${roleColors[p.role]||''}`}>{p.role}</span>
                      </td>
                      <td className="px-4 py-3 text-gray-300">{p.iplTeam || 'Did Not Play'}</td>
                      <td className="px-4 py-3 text-gray-400">{p.country}</td>
                      <td className="px-4 py-3 text-yellow-400 font-bold font-display">{formatPrice(p.basePrice)}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${statusBadge[p.status]||'bg-gray-700 text-gray-400'}`}>{p.status}</span>
                      </td>
                      <td className="px-4 py-3 text-green-400 font-bold font-display">{p.status==='sold'?formatPrice(p.soldPrice):'—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {players.length===0 && <p className="text-center text-gray-600 py-10">No players found</p>}
            </div>
          )}
      </div>

      {/* detail modal */}
      {sel && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={()=>setSel(null)}>
          <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-sm overflow-hidden" onClick={e=>e.stopPropagation()}>
            <div className="relative h-52 bg-gray-800">
              <img src={sel.image||`https://placehold.co/400x300/1F2937/white?text=${sel.name?.[0]}`}
                className="w-full h-full object-cover object-top"
                onError={e=>{e.target.src=`https://placehold.co/400x300/1F2937/white?text=${sel.name?.[0]}`;}} alt=""/>
              <div className="absolute inset-0 bg-gradient-to-t from-gray-900 to-transparent"/>
              <button onClick={()=>setSel(null)} className="absolute top-3 right-3 p-1.5 rounded-lg bg-black/50 text-white hover:bg-black/70 text-xs font-bold px-2">✕</button>
              <div className="absolute bottom-3 left-4">
                <h2 className="font-display font-bold text-white text-2xl">{sel.name}</h2>
                <p className="text-gray-400 text-xs">{sel.country} · {sel.iplTeam || 'Did Not Play'}</p>
              </div>
            </div>
            <div className="p-5 space-y-3">
              <div className="flex items-center justify-between">
                <span className={`px-3 py-1 rounded-full text-sm font-bold border ${roleColors[sel.role]||''}`}>{sel.role}</span>
                {sel.status==='sold'
                  ? <div className="text-right"><p className="text-green-400 font-display font-bold text-xl">{formatPrice(sel.soldPrice)}</p><p className="text-gray-500 text-xs">sold</p></div>
                  : <div className="text-right"><p className="text-yellow-400 font-display font-bold text-xl">{formatPrice(sel.basePrice)}</p><p className="text-gray-500 text-xs">base price</p></div>}
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  {l:'Runs',v:sel.stats?.runs},
                  {l:'SR',v:sel.stats?.strikeRate ?? sel.stats?.sr},
                  {l:'AVG',v:sel.stats?.average ?? sel.stats?.avg},
                  {l:'Wkts',v:sel.stats?.wickets ?? sel.stats?.wkts},
                  {l:'Eco',v:sel.stats?.economy ?? sel.stats?.eco},
                  {l:'Bat AVG',v:sel.stats?.battingAverage},
                  {l:'Bowl AVG',v:sel.stats?.bowlingAverage},
                ].map(({l,v})=>(
                  <div key={l} className="bg-gray-800 rounded-xl p-2.5 text-center">
                    <p className="font-display font-bold text-white">{v??0}</p>
                    <p className="text-gray-500 text-xs">{l}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
