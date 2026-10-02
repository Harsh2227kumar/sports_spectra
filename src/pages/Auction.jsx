import React, { useState, useEffect } from 'react';
import { 
  supabase, 
  getLocalTeams, 
  saveLocalTeams, 
  checkDatabaseConnection,
  getSupabaseConfig,
  updateCustomSupabaseCredentials
} from '../supabaseClient';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';

function getNormalizedTeam(teamName) {
    return (teamName || '').toLowerCase().replace(/\s+/g, '');
}

function Auction() {
    const [activeTeam, setActiveTeam] = useState(null);
    const [players, setPlayers] = useState([]);
    const [teamsList, setTeamsList] = useState(() => getLocalTeams());
    const [isPageLoading, setIsPageLoading] = useState(true);
    const [isSyncing, setIsSyncing] = useState(false);
    const [isTeamLoading, setIsTeamLoading] = useState(false);
    const [hoveredTeam, setHoveredTeam] = useState(null);
    const [dbStatus, setDbStatus] = useState({ connected: false, latency: 0, message: '' });
    const [showConfigModal, setShowConfigModal] = useState(false);
    const [configInputUrl, setConfigInputUrl] = useState(() => getSupabaseConfig().url);
    const [configInputKey, setConfigInputKey] = useState(() => getSupabaseConfig().key);

    const handleTeamClick = (teamName) => {
        if (activeTeam === teamName) return;
        setIsTeamLoading(true);
        setActiveTeam(teamName);
        setTimeout(() => setIsTeamLoading(false), 300);
    };

    const fetchAllAuctionData = async (isBackground = false) => {
        if (!isBackground) setIsPageLoading(true);
        else setIsSyncing(true);

        try {
            // Check connection status
            const status = await checkDatabaseConnection();
            setDbStatus(status);

            // Fetch players, bids, and teams dynamically from the database
            const [playersRes, bidsRes, teamsRes] = await Promise.all([
                supabase.from('players').select('*'),
                supabase.from('team_bids').select('*'),
                supabase.from('teams').select('*').order('display_order')
            ]);

            // 1. Process Teams from database
            if (!teamsRes.error && teamsRes.data && teamsRes.data.length > 0) {
                setTeamsList(teamsRes.data);
                saveLocalTeams(teamsRes.data);
            }

            // 2. Process Players & Bids directly from database - STRICTLY NO FAKE OR HARDCODED BIDS
            const dbPlayers = playersRes.data || [];
            const dbBids = bidsRes.data || [];

            // Map bids by player name (case-insensitive)
            const bidsMap = new Map();
            dbBids.forEach(b => {
                if (b.player_name) bidsMap.set(b.player_name.trim().toLowerCase(), b);
                if (b.player_id) bidsMap.set(String(b.player_id), b);
            });

            const mappedData = dbPlayers.map(p => {
                const bid = bidsMap.get(p.name?.trim().toLowerCase()) || bidsMap.get(String(p.id));
                const assignedTeam = bid ? bid.team : (p.team && p.team !== 'UNSOLD' ? p.team : 'UNSOLD');
                const winningBid = bid ? Number(bid.bid_amount || 0) : Number(p.bid_amount || 0);

                return {
                    id: p.id,
                    team: assignedTeam,
                    role: bid ? (bid.role || 'Player') : (p.role || 'Player'),
                    name: p.name,
                    gender: p.gender || 'M',
                    year: p.year || '',
                    section: p.section || '',
                    sports: p.sports || '',
                    bidAmount: winningBid,
                    photoUrl: p.photo_url || p.photoUrl || ''
                };
            });

            // Include any bids from team_bids whose players might not be in players table
            const existingNames = new Set(dbPlayers.map(p => p.name?.trim().toLowerCase()));
            dbBids.forEach(b => {
                if (b.player_name && !existingNames.has(b.player_name.trim().toLowerCase())) {
                    mappedData.push({
                        id: b.id,
                        team: b.team,
                        role: b.role || 'Player',
                        name: b.player_name,
                        gender: 'M',
                        year: '',
                        section: '',
                        sports: '',
                        bidAmount: Number(b.bid_amount || 0),
                        photoUrl: ''
                    });
                }
            });

            setPlayers(mappedData);
        } catch (err) {
            console.warn("[Sports Spectra] Error loading live auction data:", err);
        } finally {
            setIsPageLoading(false);
            setIsSyncing(false);
        }
    };

    useEffect(() => {
        // Immediate purge of any old mock data from previous tests
        try {
            const staleKeys = ['team_bids', 'auctionPlayers', 'master_players'];
            staleKeys.forEach(k => {
                const val = localStorage.getItem(k);
                if (val && (val.includes('2700') || val.includes('7300') || val.includes('4 MEMBERS') || val.includes('b1'))) {
                    localStorage.removeItem(k);
                }
            });
        } catch {}

        // Initial live fetch deferred to next tick
        const initTimer = setTimeout(() => {
            fetchAllAuctionData(false);
        }, 0);

        // Continuous high-frequency polling (every 1.5 seconds) to detect any database changes instantly
        const pollInterval = setInterval(() => {
            fetchAllAuctionData(true);
        }, 1500);

        // Instant refresh on tab focus / visibility
        const handleVisibilityOrFocus = () => {
            fetchAllAuctionData(true);
        };
        window.addEventListener('focus', handleVisibilityOrFocus);
        document.addEventListener('visibilitychange', handleVisibilityOrFocus);

        // Real-time synchronization on all tables via Supabase WebSocket
        const subscription = supabase
            .channel('live_auction_channel')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'players' }, () => {
                fetchAllAuctionData(true);
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'team_bids' }, () => {
                fetchAllAuctionData(true);
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'teams' }, () => {
                fetchAllAuctionData(true);
            })
            .subscribe();

        const handleStorageChange = () => {
            fetchAllAuctionData(true);
        };
        window.addEventListener('storage', handleStorageChange);

        return () => {
            clearTimeout(initTimer);
            clearInterval(pollInterval);
            window.removeEventListener('focus', handleVisibilityOrFocus);
            document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
            window.removeEventListener('storage', handleStorageChange);
            try { supabase.removeChannel(subscription); } catch {}
        };
    }, []);

    const handleSaveSupabaseConfig = (e) => {
        e.preventDefault();
        updateCustomSupabaseCredentials(configInputUrl, configInputKey);
        setShowConfigModal(false);
        setTimeout(() => fetchAllAuctionData(false), 200);
    };

    const renderLeaderCard = (leader, roleTitle, roleIcon, bgColor) => {
        const roleColor = roleTitle === 'CAPTAIN' ? 'bg-[#FF4500]' : 'bg-[#1e1e1e]';
        const isLightBg = ['#D6CFCB', '#FFB74D', '#F06292', '#FF8A65', '#C5E1A5', '#FFD54F', '#A1887F', '#90A4AE'].includes(bgColor);
        const initialColor = isLightBg ? 'text-gray-900' : 'text-white';
        const cardBgImg = leader.gender === 'M' ? '/boy_bg.png' : '/girl_bg.png';
        
        return (
            <div className="bg-white rounded-[40px] p-10 shadow-xl shadow-gray-200/50 border border-white overflow-hidden relative group hover:shadow-2xl hover:shadow-orange-100 transition-all duration-300"
                 style={{ background: `url('${cardBgImg}') no-repeat center center`, backgroundSize: 'cover' }}>
                <div className={`absolute top-0 right-0 ${roleColor} text-white px-6 py-2 rounded-bl-3xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 z-10 shadow-sm`}>
                    <i className={`fa-solid ${roleIcon}`}></i> {roleTitle}
                </div>
                <div className="flex flex-col items-center relative z-10">
                    <div className={`w-40 h-40 rounded-[32px] flex items-center justify-center text-5xl font-black ${initialColor} shadow-inner mb-8 group-hover:scale-105 transition-transform duration-300 border border-black/5 overflow-hidden`} style={{ backgroundColor: bgColor || '#FF4500' }}>
                        {leader.photo ? (
                            <img src={leader.photo} className="w-full h-full object-cover" alt={leader.name} />
                        ) : (
                            leader.initials || (leader.name ? leader.name.slice(0, 2).toUpperCase() : 'LD')
                        )}
                    </div>
                    <h3 className="text-3xl font-black tracking-tighter text-center text-gray-900 leading-tight">{leader.name}</h3>
                    <p className="text-gray-400 font-bold uppercase text-[10px] mt-2 tracking-widest">{leader.gender} &nbsp;|&nbsp; {roleTitle}</p>
                    <div className="mt-8 bg-orange-50 border border-orange-100 px-8 py-2.5 rounded-full flex items-center gap-2 shadow-sm">
                        <i className="fa-solid fa-circle-check text-orange-500"></i>
                        <span className="text-orange-500 font-black text-xs uppercase tracking-widest">RETAINED</span>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="flex h-screen overflow-hidden">
            {/* SIDEBAR */}
            <aside className="flex flex-col shrink-0" style={{ background: "url('/left-navbar.png') no-repeat center center", backgroundSize: 'cover', width: '260px', transition: 'all 0.3s' }}>
                <div className="p-8">
                    <div className="flex items-center gap-3">
                        <div className="bg-orange-600 p-2 rounded-xl text-white">
                            <i className="fa-solid fa-bolt-lightning"></i>
                        </div>
                        <div className="hero-font text-white text-lg leading-none cursor-pointer" onClick={() => setActiveTeam(null)}>
                            SPORTS<br /><span className="text-orange-500">SPECTRA 4.0</span>
                        </div>
                    </div>
                </div>
                
                <nav className="flex-1 mt-4 overflow-y-auto no-scrollbar" onMouseLeave={() => setHoveredTeam(null)}>
                    {activeTeam ? (
                        <a onClick={() => setActiveTeam(null)} className="text-[#9CA3AF] hover:bg-white/5 hover:text-white transition-all rounded-xl mx-4 my-1 px-4 py-3 flex items-center gap-3 font-semibold text-sm cursor-pointer">
                            <i className="fa-solid fa-house-chimney w-5 text-center"></i> Dashboard
                        </a>
                    ) : (
                        <Link to="/" className="text-[#9CA3AF] hover:bg-white/5 hover:text-white transition-all rounded-xl mx-4 my-1 px-4 py-3 flex items-center gap-3 font-semibold text-sm cursor-pointer">
                            <i className="fa-solid fa-arrow-left w-5 text-center"></i> Back to main website
                        </Link>
                    )}
                    <div className="px-8 mt-4 mb-2 text-[10px] font-bold text-gray-500 uppercase tracking-widest">Franchises ({teamsList.length})</div>
                    
                    {teamsList.map(teamObj => (
                        <a key={teamObj.name} onClick={() => handleTeamClick(teamObj.name)} onMouseEnter={() => setHoveredTeam(teamObj.name)}
                           className={`relative block text-[#9CA3AF] hover:text-white transition-colors rounded-xl mx-4 my-1 px-4 py-3 cursor-pointer group ${(hoveredTeam || activeTeam) === teamObj.name ? '!text-white' : ''}`}>
                            {(hoveredTeam || activeTeam) === teamObj.name && (
                                <motion.div
                                    layoutId="navIndicator"
                                    className="absolute inset-0 bg-[#FF6B00] rounded-xl shadow-[0_10px_15px_-3px_rgba(255,107,0,0.4)]"
                                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                                />
                            )}
                            <span className="relative z-10 flex items-center gap-3 font-semibold text-sm">
                                <i className="fa-solid fa-users w-5 text-center"></i> {teamObj.name}
                                {activeTeam === teamObj.name && <i className="fa-solid fa-chevron-right ml-auto text-[10px]"></i>}
                            </span>
                        </a>
                    ))}

                    <div className="px-8 mt-6 mb-2 text-[10px] font-bold text-gray-500 uppercase tracking-widest">Management</div>
                    <Link to="/doremon" className="text-[#9CA3AF] hover:bg-white/5 hover:text-white transition-all rounded-xl mx-4 my-1 px-4 py-2.5 flex items-center gap-3 font-semibold text-xs cursor-pointer">
                        <i className="fa-solid fa-gavel w-5 text-center text-orange-500"></i> Auction Bidding
                    </Link>
                    <Link to="/doremon/import-export" className="text-[#9CA3AF] hover:bg-white/5 hover:text-white transition-all rounded-xl mx-4 my-1 px-4 py-2.5 flex items-center gap-3 font-semibold text-xs cursor-pointer">
                        <i className="fa-solid fa-file-import w-5 text-center text-orange-500"></i> Import & Export
                    </Link>
                </nav>

                {/* Connection Status in Sidebar */}
                <div className="p-4 mx-4 mb-4 bg-black/40 rounded-2xl border border-white/10 text-xs">
                    <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Database</span>
                        {dbStatus.connected ? (
                            <span className="flex items-center gap-1.5 text-green-400 font-bold text-[10px]">
                                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                                {dbStatus.latency}ms
                            </span>
                        ) : (
                            <span className="text-amber-400 font-bold text-[10px]">Disconnected</span>
                        )}
                    </div>
                    <button onClick={() => setShowConfigModal(true)} className="text-[10px] text-orange-400 hover:text-orange-300 font-bold underline cursor-pointer">
                        {dbStatus.connected ? 'Settings' : 'Configure Supabase'}
                    </button>
                </div>
            </aside>

            {/* MAIN CONTENT AREA */}
            <main className="flex-1 flex flex-col overflow-y-auto relative" style={{ background: "url('/bg.png') no-repeat center center fixed", backgroundSize: 'cover' }}>
                
                {!activeTeam ? (
                    <div className="p-10 flex-1 relative z-10">
                        <div className="mb-12 flex flex-col md:flex-row md:items-end justify-between gap-4">
                            <div>
                                <div className="flex items-center gap-2 mb-2">
                                    <div className="w-8 h-1 bg-orange-500 rounded-full"></div>
                                    <span className="text-xs font-bold text-gray-800 tracking-widest uppercase flex items-center gap-2">
                                        Live Auction
                                        {isPageLoading ? (
                                            <span className="bg-blue-100 text-blue-700 px-2.5 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 animate-pulse">
                                                <i className="fa-solid fa-circle-notch fa-spin"></i> FETCHING FROM DATABASE
                                            </span>
                                        ) : isSyncing ? (
                                            <span className="bg-orange-100 text-orange-700 px-2.5 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 animate-pulse">
                                                <i className="fa-solid fa-arrows-rotate fa-spin"></i> SYNCING CHANGES
                                            </span>
                                        ) : dbStatus.connected ? (
                                            <span className="bg-green-100 text-green-700 px-2.5 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1">
                                                <i className="fa-solid fa-circle text-[6px] animate-pulse"></i> SUPABASE LIVE ({dbStatus.latency}ms)
                                            </span>
                                        ) : (
                                            <span className="bg-amber-100 text-amber-800 px-2.5 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 cursor-pointer" onClick={() => setShowConfigModal(true)}>
                                                <i className="fa-solid fa-triangle-exclamation"></i> SETUP SUPABASE DB
                                            </span>
                                        )}
                                    </span>
                                </div>
                                <h1 className="hero-font text-5xl md:text-6xl text-gray-900 tracking-tighter leading-none mb-1">
                                    AUCTION <span className="text-orange-500">DASHBOARD</span>
                                </h1>
                                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                                    Real-time Franchise Standings & Budget
                                </p>
                            </div>

                            <div className="flex items-center gap-3">
                                <button onClick={() => fetchAllAuctionData(true)} 
                                        className="bg-white/90 hover:bg-white text-gray-700 font-bold px-4 py-2.5 rounded-xl border border-gray-200 text-xs flex items-center gap-2 shadow-xs transition hover:shadow cursor-pointer">
                                    <i className={`fa-solid fa-rotate text-orange-500 ${isSyncing ? 'fa-spin' : ''}`}></i>
                                    Refresh Now
                                </button>
                                <button onClick={() => setShowConfigModal(true)} 
                                        className="bg-orange-500 hover:bg-orange-600 text-white font-bold px-4 py-2.5 rounded-xl text-xs flex items-center gap-2 shadow-sm transition cursor-pointer">
                                    <i className="fa-solid fa-database"></i>
                                    Database Connection
                                </button>
                            </div>
                        </div>

                        {isPageLoading ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6 max-w-7xl mx-auto">
                                {[1,2,3,4,5,6,7,8].map(i => (
                                    <div key={i} className="bg-white rounded-[24px] p-6 border border-gray-100 relative h-[260px]">
                                        <div className="animate-pulse flex flex-col h-full justify-between">
                                            <div className="flex items-center gap-4 mt-2">
                                                <div className="w-24 h-24 bg-gray-200 rounded-xl"></div>
                                                <div className="flex flex-col gap-2">
                                                    <div className="w-20 h-6 bg-gray-200 rounded"></div>
                                                    <div className="w-16 h-3 bg-gray-200 rounded"></div>
                                                </div>
                                            </div>
                                            <div className="flex justify-between items-end mt-4">
                                                <div className="flex flex-col gap-2">
                                                    <div className="w-12 h-3 bg-gray-200 rounded"></div>
                                                    <div className="w-16 h-5 bg-gray-200 rounded"></div>
                                                </div>
                                                <div className="flex flex-col gap-2 items-end">
                                                    <div className="w-12 h-3 bg-gray-200 rounded"></div>
                                                    <div className="w-16 h-5 bg-gray-200 rounded"></div>
                                                </div>
                                            </div>
                                            <div className="mt-5 pt-4 border-t border-gray-50">
                                                <div className="w-full h-2.5 bg-gray-200 rounded-full"></div>
                                                <div className="w-12 h-2 bg-gray-200 rounded mt-2"></div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6 max-w-7xl mx-auto">
                                {teamsList.map(teamObj => {
                                    const team = teamObj.name;
                                    const totalPurse = Number(teamObj.total_purse || 10000);
                                    
                                    // Drafted players strictly matching this team
                                    const teamDraftedPlayers = players.filter(p => getNormalizedTeam(p.team) === getNormalizedTeam(team));
                                    const totalSpent = teamDraftedPlayers.reduce((sum, p) => sum + Number(p.bidAmount || 0), 0);
                                    const purseLeft = Math.max(0, totalPurse - totalSpent);
                                    const percentUsed = totalPurse > 0 ? Math.min(100, Math.round((totalSpent / totalPurse) * 100)) : 0;
                                    const logoUrl = teamObj.logo_url || '/logo1.png';
                                    const themeColor = teamObj.color || 'bg-orange-500';

                                    // Retained leaders count
                                    const retainedLeadersCount = (teamObj.captain_name ? 1 : 0) + (teamObj.vice_captain_name ? 1 : 0);
                                    const totalSquadCount = teamDraftedPlayers.length + retainedLeadersCount;
                                    
                                    return (
                                        <div key={team} onClick={() => handleTeamClick(team)}
                                             className="bg-white rounded-[24px] p-6 shadow-sm border border-gray-100 hover:shadow-xl transition-all cursor-pointer relative overflow-hidden group">
                                            
                                            {/* Faint watermark on the right */}
                                            <div className="absolute -bottom-4 -right-4 w-40 h-40 opacity-[0.04] group-hover:scale-110 group-hover:opacity-[0.08] transition-all pointer-events-none grayscale">
                                                <img src={logoUrl} className="w-full h-full object-contain" alt="" />
                                            </div>

                                            {/* Chevron icon top right */}
                                            <div className="absolute top-4 right-4 w-6 h-6 rounded-full bg-gray-50 flex items-center justify-center text-gray-400 group-hover:bg-gray-100 transition-colors shadow-sm">
                                                <i className="fa-solid fa-chevron-right text-[10px]"></i>
                                            </div>

                                            <div className="flex items-center gap-4 relative z-10 mb-6 mt-4">
                                                <img src={logoUrl} className="w-24 h-24 object-contain drop-shadow-md group-hover:scale-110 transition-transform -ml-2" alt={`${team} logo`} />
                                                <div>
                                                    <h3 className="text-xl font-black text-gray-900 uppercase tracking-tight leading-none">{team}</h3>
                                                    <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest mt-1.5">
                                                        {totalSquadCount} MEMBERS SQUAD
                                                    </p>
                                                </div>
                                            </div>

                                            <div className="flex justify-between items-end relative z-10">
                                                <div>
                                                    <p className="text-[9px] text-gray-400 uppercase tracking-widest font-bold mb-1">Purse Left</p>
                                                    <p className="text-xl font-black text-green-500 leading-none">₹{purseLeft.toLocaleString('en-IN')}</p>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-[9px] text-gray-400 uppercase tracking-widest font-bold mb-1">Spent</p>
                                                    <p className="text-xl font-black text-gray-900 leading-none">₹{totalSpent.toLocaleString('en-IN')}</p>
                                                </div>
                                            </div>
                                            
                                            <div className="mt-5 relative z-10 pt-4 border-t border-gray-50">
                                                <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden shadow-inner">
                                                    <div className={`h-full ${themeColor} rounded-full transition-all duration-500`} style={{ width: `${percentUsed}%` }}></div>
                                                </div>
                                                <div className="flex justify-between items-center mt-2">
                                                    <p className="text-[9px] font-bold text-gray-400">{percentUsed}% USED</p>
                                                    <p className="text-[9px] font-bold text-gray-400">{teamDraftedPlayers.length} Drafted</p>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="p-10 flex-1 relative z-10">
                        {/* LIVE AUCTION Title & Breadcrumbs */}
                        <div className="flex justify-between items-center mb-8">
                            <div>
                                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Live Auction</p>
                                <h2 className="hero-font text-4xl text-gray-900 tracking-tight">AUCTION <span className="text-orange-500">DASHBOARD</span></h2>
                                <div className="flex items-center gap-2 text-[11px] text-gray-400 mt-1 font-bold uppercase tracking-wider">
                                    <Link to="/" className="hover:text-orange-500 transition"><i className="fa-solid fa-house"></i></Link> / 
                                    <a onClick={() => setActiveTeam(null)} className="hover:text-orange-500 transition cursor-pointer">Teams</a> / 
                                    <span className="text-gray-900">{activeTeam}</span>
                                </div>
                            </div>
                            <div className="flex items-center gap-4">
                                <button onClick={() => setActiveTeam(null)} className="bg-white/90 hover:bg-white text-gray-700 font-bold px-4 py-2.5 rounded-xl border border-gray-200 text-xs flex items-center gap-2 shadow-xs transition cursor-pointer">
                                    <i className="fa-solid fa-arrow-left"></i> All Franchises
                                </button>
                                <button onClick={() => fetchAllAuctionData(true)} className="bg-orange-500 hover:bg-orange-600 text-white font-bold px-4 py-2.5 rounded-xl text-xs flex items-center gap-2 shadow-sm transition cursor-pointer">
                                    <i className={`fa-solid fa-arrows-rotate ${isSyncing ? 'fa-spin' : ''}`}></i>
                                    Sync
                                </button>
                            </div>
                        </div>

                        {isTeamLoading ? (
                            <div className="max-w-7xl mx-auto w-full animate-pulse">
                                <div className="h-32 bg-gray-200/60 rounded-[24px] mb-10 border border-gray-100"></div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
                                    {[1, 2].map(i => (
                                        <div key={i} className="bg-white rounded-[40px] p-10 h-[400px] shadow-sm border border-gray-100">
                                            <div className="w-40 h-40 bg-gray-200/80 rounded-[32px] mx-auto mb-8"></div>
                                            <div className="w-48 h-8 bg-gray-200/80 rounded-full mx-auto mb-4"></div>
                                            <div className="w-32 h-4 bg-gray-200/80 rounded-full mx-auto"></div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div className="max-w-7xl mx-auto w-full">
                                {(() => {
                                    const teamDraftedPlayers = players.filter(p => getNormalizedTeam(p.team) === getNormalizedTeam(activeTeam));
                                    const currentTeamData = teamsList.find(t => getNormalizedTeam(t.name) === getNormalizedTeam(activeTeam)) || {
                                        name: activeTeam,
                                        total_purse: 10000,
                                        captain_name: '',
                                        captain_gender: 'M',
                                        vice_captain_name: '',
                                        vice_captain_gender: 'F'
                                    };

                                    const captainData = {
                                        name: currentTeamData.captain_name || 'Captain',
                                        gender: currentTeamData.captain_gender || 'M',
                                        initials: currentTeamData.captain_initials || (currentTeamData.captain_name ? currentTeamData.captain_name.slice(0, 2).toUpperCase() : 'CP'),
                                        color: currentTeamData.captain_color || '#D6CFCB',
                                        photo: currentTeamData.captain_photo || ''
                                    };

                                    const viceCaptainData = {
                                        name: currentTeamData.vice_captain_name || 'Vice Captain',
                                        gender: currentTeamData.vice_captain_gender || 'F',
                                        initials: currentTeamData.vice_captain_initials || (currentTeamData.vice_captain_name ? currentTeamData.vice_captain_name.slice(0, 2).toUpperCase() : 'VC'),
                                        color: currentTeamData.vice_captain_color || '#2196F3',
                                        photo: currentTeamData.vice_captain_photo || ''
                                    };

                                    const regulars = teamDraftedPlayers;
                                    const totalGirls = (captainData.gender === 'F' && currentTeamData.captain_name ? 1 : 0) + 
                                                       (viceCaptainData.gender === 'F' && currentTeamData.vice_captain_name ? 1 : 0) + 
                                                       regulars.filter(p => p.gender === 'F').length;
                                    const girlsRemaining = Math.max(0, 15 - totalGirls);
                                    const totalSpent = regulars.reduce((sum, p) => sum + Number(p.bidAmount || 0), 0);
                                    const totalPurse = Number(currentTeamData.total_purse || 10000);
                                    const purseLeft = Math.max(0, totalPurse - totalSpent);
                                    const retainedCount = (currentTeamData.captain_name ? 1 : 0) + (currentTeamData.vice_captain_name ? 1 : 0);

                                    return (
                                        <>
                                            {/* TEAM INFO & STATS */}
                                            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-10 bg-orange-50/40 p-6 rounded-[24px] border border-orange-100/50 backdrop-blur-sm shadow-sm">
                                                <div>
                                                    <h2 className="text-5xl font-black tracking-tighter text-gray-900">{activeTeam.toUpperCase()}</h2>
                                                    <p className="text-orange-500 font-black text-xs uppercase tracking-[0.2em] mt-2">
                                                        {regulars.length + retainedCount} PLAYERS SQUAD ({regulars.length} DRAFTED)
                                                    </p>
                                                </div>
                                                <div className="flex flex-wrap gap-4">
                                                    <div className="rounded-[20px] px-6 py-4 flex items-center gap-4 border border-black/5 bg-[#FFF0F5] shadow-sm">
                                                        <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-pink-500 shadow-sm"><i className="fa-solid fa-user-group text-xl"></i></div>
                                                        <div>
                                                            <p className="text-[10px] font-extrabold text-pink-400 uppercase tracking-widest">Girls Needed</p>
                                                            <p className="text-3xl font-black text-pink-600 leading-none mt-1">{girlsRemaining}</p>
                                                        </div>
                                                    </div>
                                                    <div className="rounded-[20px] px-6 py-4 flex items-center gap-4 border border-black/5 bg-white shadow-sm">
                                                        <div className="w-12 h-12 bg-gray-50 rounded-2xl flex items-center justify-center text-gray-600 shadow-inner border border-gray-100"><i className="fa-solid fa-coins text-xl"></i></div>
                                                        <div>
                                                            <p className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest">Total Spent</p>
                                                            <p className="text-3xl font-black text-gray-900 leading-none mt-1">₹{totalSpent.toLocaleString('en-IN')}</p>
                                                        </div>
                                                    </div>
                                                    <div className="rounded-[20px] px-6 py-4 flex items-center gap-4 border border-black/5 bg-[#EBFCF5] shadow-sm">
                                                        <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-green-500 shadow-sm"><i className="fa-solid fa-money-bill-wave text-xl"></i></div>
                                                        <div>
                                                            <p className="text-[10px] font-extrabold text-green-500 uppercase tracking-widest">Purse Left</p>
                                                            <p className="text-3xl font-black text-green-600 leading-none mt-1">₹{purseLeft.toLocaleString('en-IN')}</p>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* RETAINED LEADERS (Only show if captain/vice-captain are configured) */}
                                            {(currentTeamData.captain_name || currentTeamData.vice_captain_name) && (
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
                                                    {currentTeamData.captain_name ? renderLeaderCard(captainData, 'CAPTAIN', 'fa-crown', captainData.color) : null}
                                                    {currentTeamData.vice_captain_name ? renderLeaderCard(viceCaptainData, 'VICE CAPTAIN', 'fa-star', viceCaptainData.color) : null}
                                                </div>
                                            )}

                                            {/* DRAFTED PLAYERS SQUAD */}
                                            <div className="bg-white rounded-[32px] p-8 shadow-sm border border-gray-100 mb-12">
                                                <div className="flex justify-between items-center mb-6">
                                                    <div>
                                                        <h3 className="text-2xl font-black text-gray-900">Drafted Squad</h3>
                                                        <p className="text-xs text-gray-400 uppercase tracking-wider font-bold mt-1">
                                                            {regulars.length} Regular Players Drafted
                                                        </p>
                                                    </div>
                                                    <div className="text-xs font-bold text-gray-500">
                                                        {activeTeam}
                                                    </div>
                                                </div>

                                                {regulars.length === 0 ? (
                                                    <div className="text-center py-16 bg-gray-50/50 rounded-2xl border border-dashed border-gray-200">
                                                        <i className="fa-solid fa-users text-4xl text-gray-300 mb-3"></i>
                                                        <p className="text-gray-500 font-bold text-sm">No regular players drafted yet for {activeTeam}.</p>
                                                        <p className="text-gray-400 text-xs mt-1">Go to the Auction Bidding desk in Admin Panel to draft players from the database.</p>
                                                    </div>
                                                ) : (
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                        {regulars.map(player => (
                                                            <div key={player.id} className="bg-gray-50/60 hover:bg-orange-50/50 rounded-2xl p-4 flex items-center justify-between border border-gray-100 transition group">
                                                                <div className="flex items-center gap-4">
                                                                    <div className="w-14 h-14 rounded-2xl bg-orange-100 text-orange-600 flex items-center justify-center font-black text-base shrink-0 overflow-hidden shadow-xs">
                                                                        {player.photoUrl ? (
                                                                            <img src={player.photoUrl} alt="" className="w-full h-full object-cover" />
                                                                        ) : (
                                                                            player.name.charAt(0)
                                                                        )}
                                                                    </div>
                                                                    <div>
                                                                        <div className="flex items-center gap-2">
                                                                            <span className="font-bold text-gray-900 text-base">{player.name}</span>
                                                                            <span className="text-[10px] font-bold bg-white text-gray-600 border border-gray-200 px-2 py-0.5 rounded-md">
                                                                                {player.gender}
                                                                            </span>
                                                                        </div>
                                                                        <p className="text-xs text-gray-500 mt-1">
                                                                            Year: <strong>{player.year || 'N/A'}</strong> | Sec: <strong>{player.section || 'N/A'}</strong> | <strong>{player.sports || 'Sports'}</strong>
                                                                        </p>
                                                                    </div>
                                                                </div>
                                                                <div className="text-right">
                                                                    <span className="text-lg font-black text-orange-600">
                                                                        ₹{Number(player.bidAmount || 0).toLocaleString('en-IN')}
                                                                    </span>
                                                                    <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Winning Bid</p>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </>
                                    );
                                })()}
                            </div>
                        )}
                    </div>
                )}
            </main>

            {/* Supabase Configuration Modal */}
            {showConfigModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl p-8 max-w-lg w-full shadow-2xl border border-gray-100">
                        <div className="flex justify-between items-center mb-6">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-orange-500 text-white flex items-center justify-center font-bold">
                                    <i className="fa-solid fa-database"></i>
                                </div>
                                <div>
                                    <h3 className="font-black text-xl text-gray-900">Supabase Connection</h3>
                                    <p className="text-xs text-gray-400 font-bold">Live Database Integration</p>
                                </div>
                            </div>
                            <button onClick={() => setShowConfigModal(false)} className="text-gray-400 hover:text-gray-600 cursor-pointer">
                                <i className="fa-solid fa-xmark text-lg"></i>
                            </button>
                        </div>

                        <div className={`p-4 rounded-2xl mb-6 text-xs font-medium border ${dbStatus.connected ? 'bg-green-50 text-green-800 border-green-200' : 'bg-amber-50 text-amber-800 border-amber-200'}`}>
                            <div className="flex items-center gap-2 font-bold mb-1">
                                <i className={`fa-solid ${dbStatus.connected ? 'fa-circle-check text-green-600' : 'fa-triangle-exclamation text-amber-600'}`}></i>
                                <span>{dbStatus.connected ? 'Connected to Supabase' : 'Status: ' + dbStatus.message}</span>
                            </div>
                            {dbStatus.connected && (
                                <p className="text-green-700 text-[11px]">Real-time latency: {dbStatus.latency}ms</p>
                            )}
                        </div>

                        <form onSubmit={handleSaveSupabaseConfig} className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                                    Supabase Project URL
                                </label>
                                <input
                                    type="url"
                                    placeholder="https://xyzcompany.supabase.co"
                                    value={configInputUrl}
                                    onChange={(e) => setConfigInputUrl(e.target.value)}
                                    className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-orange-500"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                                    Supabase Anon Public API Key
                                </label>
                                <textarea
                                    rows={3}
                                    placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                                    value={configInputKey}
                                    onChange={(e) => setConfigInputKey(e.target.value)}
                                    className="w-full px-4 py-3 rounded-xl border border-gray-200 text-xs font-mono focus:outline-none focus:border-orange-500"
                                />
                            </div>

                            <div className="flex gap-3 pt-4">
                                <button type="button" onClick={() => setShowConfigModal(false)}
                                        className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl text-sm cursor-pointer">
                                    Cancel
                                </button>
                                <button type="submit"
                                        className="flex-1 py-3 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-xl text-sm cursor-pointer shadow-md shadow-orange-500/20">
                                    Save & Connect
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}

export default Auction;
