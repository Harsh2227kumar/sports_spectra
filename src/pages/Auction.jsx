import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';

const TOTAL_PURSE = 10000;
const TEAMS = ['Team 1', 'Team 2', 'Team 3', 'Team 4', 'Team 5', 'Team 6', 'Team 7', 'Team 8'];

const HARDCODED_LEADERS = {
    'Team 1': { captain: { name: 'Atharva Anil Masharkar', gender: 'M', initials: 'AM', color: '#D6CFCB' }, viceCaptain: { name: 'SHRIYA YERANE', gender: 'F', initials: 'SY', color: '#2196F3' } },
    'Team 2': { captain: { name: 'Chaitanya Kharpate', gender: 'M', initials: 'CK', color: '#FFB74D' }, viceCaptain: { name: 'Mahek Malkan', gender: 'F', initials: 'MM', color: '#BA68C8' } },
    'Team 3': { captain: { name: 'Karan Deshmukh', gender: 'M', initials: 'KD', color: '#4DB6AC' }, viceCaptain: { name: 'Sejal Lende', gender: 'F', initials: 'SL', color: '#F06292' } },
    'Team 4': { captain: { name: 'Ranvir Thakur', gender: 'M', initials: 'RT', color: '#7986CB' }, viceCaptain: { name: 'Radhika Sapate', gender: 'F', initials: 'RS', color: '#FF8A65' } },
    'Team 5': { captain: { name: 'Arnav Sakharkar', gender: 'M', initials: 'AS', color: '#E65100' }, viceCaptain: { name: 'Ritisha Naigaonkar', gender: 'F', initials: 'RN', color: '#0277BD' } },
    'Team 6': { captain: { name: 'Manthan Gujar', gender: 'M', initials: 'MG', color: '#D84315', photo: '/manthan.png' }, viceCaptain: { name: 'Aarya Raut', gender: 'F', initials: 'AR', color: '#C5E1A5' } },
    'Team 7': { captain: { name: 'Parth tiwaskar', gender: 'M', initials: 'PT', color: '#A1887F' }, viceCaptain: { name: 'Janhavi Admane', gender: 'F', initials: 'JA', color: '#F48FB1' } },
    'Team 8': { captain: { name: 'Shervin Peter', gender: 'M', initials: 'SP', color: '#90A4AE' }, viceCaptain: { name: 'Gauri Savale', gender: 'F', initials: 'GS', color: '#FFD54F' } }
};

const TEAM_THEMES = {
    'Team 1': { color: 'bg-orange-500', text: 'text-orange-500', from: 'from-orange-500', logo: '/logo1.png' },
    'Team 2': { color: 'bg-blue-600', text: 'text-blue-600', from: 'from-blue-600', logo: '/logo2.png' },
    'Team 3': { color: 'bg-red-600', text: 'text-red-600', from: 'from-red-600', logo: '/logo3.png' },
    'Team 4': { color: 'bg-purple-600', text: 'text-purple-600', from: 'from-purple-600', logo: '/logo4.png' },
    'Team 5': { color: 'bg-green-600', text: 'text-green-600', from: 'from-green-600', logo: '/logo5.png' },
    'Team 6': { color: 'bg-yellow-600', text: 'text-yellow-600', from: 'from-yellow-600', logo: '/logo6.png' },
    'Team 7': { color: 'bg-pink-600', text: 'text-pink-600', from: 'from-pink-600', logo: '/logo7.png' },
    'Team 8': { color: 'bg-cyan-600', text: 'text-cyan-600', from: 'from-cyan-600', logo: '/logo8.png' }
};

function getNormalizedTeam(teamName) {
    return teamName.toLowerCase().replace(/\s+/g, '');
}

function Auction() {
    const [activeTeam, setActiveTeam] = useState(null);
    const [players, setPlayers] = useState([]);
    const [isPageLoading, setIsPageLoading] = useState(true);
    const [isSyncing, setIsSyncing] = useState(false);
    const [isTeamLoading, setIsTeamLoading] = useState(false);
    const [hoveredTeam, setHoveredTeam] = useState(null);

    const handleTeamClick = (team) => {
        if (activeTeam === team) return;
        setIsTeamLoading(true);
        setActiveTeam(team);
        setTimeout(() => setIsTeamLoading(false), 500);
    };

    useEffect(() => {
        const fetchSupabasePlayers = async (isBackground = false) => {
            if (!isBackground) setIsPageLoading(true);
            else setIsSyncing(true);

            const { data, error } = await supabase
                .from('players')
                .select('*');
            
            if (error) {
                console.error("Error fetching from Supabase:", error);
            } else if (data) {
                // Map Supabase snake_case back to camelCase used by the frontend
                const mappedData = data.map(p => ({
                    id: p.id,
                    team: p.team,
                    role: p.role,
                    name: p.name,
                    gender: p.gender,
                    year: p.year,
                    section: p.section,
                    sports: p.sports,
                    bidAmount: p.bid_amount,
                    photoUrl: p.photo_url
                }));
                setPlayers(mappedData);
                localStorage.setItem('auctionPlayers', JSON.stringify(mappedData));
            }

            setIsPageLoading(false);
            setIsSyncing(false);
        };

        fetchSupabasePlayers(false);

        // Subscribe to real-time changes
        const subscription = supabase
            .channel('players_channel')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'players' }, payload => {
                fetchSupabasePlayers(true); // background fetch
            })
            .subscribe();

        // Local storage listener for manual changes in Admin tab (fallback)
        const loadPlayers = () => {
            const currentData = localStorage.getItem('auctionPlayers') || '[]';
            setPlayers(JSON.parse(currentData));
        };
        window.addEventListener('storage', loadPlayers);

        return () => {
            window.removeEventListener('storage', loadPlayers);
            supabase.removeChannel(subscription);
        };
    }, []);

    const renderLeaderCard = (player, roleTitle, roleIcon, bgColor) => {
        const roleColor = roleTitle === 'CAPTAIN' ? 'bg-[#FF4500]' : 'bg-[#1e1e1e]';
        const isLightBg = ['#D6CFCB', '#FFB74D', '#F06292', '#FF8A65', '#C5E1A5', '#FFD54F', '#A1887F', '#90A4AE'].includes(bgColor);
        const initialColor = isLightBg ? 'text-gray-900' : 'text-white';
        const cardBgImg = player.gender === 'M' ? '/boy_bg.png' : '/girl_bg.png';
        
        return (
            <div className="bg-white rounded-[40px] p-10 shadow-xl shadow-gray-200/50 border border-white overflow-hidden relative group hover:shadow-2xl hover:shadow-orange-100 transition-all duration-300"
                 style={{ background: `url('${cardBgImg}') no-repeat center center`, backgroundSize: 'cover' }}>
                <div className={`absolute top-0 right-0 ${roleColor} text-white px-6 py-2 rounded-bl-3xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 z-10 shadow-sm`}>
                    <i className={`fa-solid ${roleIcon}`}></i> {roleTitle}
                </div>
                <div className="flex flex-col items-center relative z-10">
                    <div className={`w-40 h-40 rounded-[32px] flex items-center justify-center text-5xl font-black ${initialColor} shadow-inner mb-8 group-hover:scale-105 transition-transform duration-300 border border-black/5 overflow-hidden`} style={{ backgroundColor: bgColor }}>
                        {player.photo ? (
                            <img src={player.photo} className="w-full h-full object-cover" alt={player.name} />
                        ) : (
                            player.initials
                        )}
                    </div>
                    <h3 className="text-3xl font-black tracking-tighter text-center text-gray-900 leading-tight">{player.name}</h3>
                    <p className="text-gray-400 font-bold uppercase text-[10px] mt-2 tracking-widest">{player.gender} &nbsp;|&nbsp; PLAYER</p>
                    <div className="mt-8 bg-orange-50 border border-orange-100 px-8 py-2.5 rounded-full flex items-center gap-2 shadow-sm">
                        <i className="fa-solid fa-circle-check text-orange-500"></i>
                        <span className="text-orange-500 font-black text-xs uppercase tracking-widest">RETAINED</span>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="flex flex-col md:flex-row h-screen overflow-hidden">
            {/* SIDEBAR */}
            <aside className="flex flex-col md:flex-col shrink-0 w-full md:w-[260px] h-auto md:h-full z-20 shadow-lg md:shadow-none" style={{ background: "url('/left-navbar.png') no-repeat center center", backgroundSize: 'cover', transition: 'all 0.3s' }}>
                <div className="p-4 md:p-8 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <div className="bg-orange-600 p-2 rounded-xl text-white">
                            <i className="fa-solid fa-bolt-lightning"></i>
                        </div>
                        <div className="hero-font text-white text-lg leading-none cursor-pointer" onClick={() => setActiveTeam(null)}>
                            SPORTS<br /><span className="text-orange-500">SPECTRA 4.0</span>
                        </div>
                    </div>
                </div>
                
                <nav className="flex-1 px-2 md:px-0 mt-0 md:mt-4 flex flex-row md:flex-col overflow-x-auto md:overflow-y-auto no-scrollbar items-center md:items-stretch border-t border-white/5 md:border-none" onMouseLeave={() => setHoveredTeam(null)}>
                    {activeTeam ? (
                        <a onClick={() => setActiveTeam(null)} className="shrink-0 text-[#9CA3AF] hover:bg-white/5 hover:text-white transition-all rounded-xl mx-2 md:mx-4 my-2 md:my-1 px-3 md:px-4 py-2 md:py-3 flex items-center gap-2 md:gap-3 font-semibold text-xs md:text-sm cursor-pointer">
                            <i className="fa-solid fa-house-chimney w-4 md:w-5 text-center"></i> <span className="hidden md:inline">Dashboard</span>
                        </a>
                    ) : (
                        <Link to="/" className="shrink-0 text-[#9CA3AF] hover:bg-white/5 hover:text-white transition-all rounded-xl mx-2 md:mx-4 my-2 md:my-1 px-3 md:px-4 py-2 md:py-3 flex items-center gap-2 md:gap-3 font-semibold text-xs md:text-sm cursor-pointer">
                            <i className="fa-solid fa-arrow-left w-4 md:w-5 text-center"></i> <span className="hidden md:inline">Back</span>
                        </Link>
                    )}
                    <div className="hidden md:block px-8 mt-4 mb-2 text-[10px] font-bold text-gray-500 uppercase tracking-widest">Franchises</div>
                    
                    {TEAMS.map(team => (
                        <a key={team} onClick={() => handleTeamClick(team)} onMouseEnter={() => setHoveredTeam(team)}
                           className={`shrink-0 relative block text-[#9CA3AF] hover:text-white transition-colors rounded-xl mx-1 md:mx-4 my-2 md:my-1 px-3 md:px-4 py-2 md:py-3 cursor-pointer group ${(hoveredTeam || activeTeam) === team ? '!text-white' : ''}`}>
                            {(hoveredTeam || activeTeam) === team && (
                                <motion.div
                                    layoutId="navIndicator"
                                    className="absolute inset-0 bg-[#FF6B00] rounded-xl shadow-[0_10px_15px_-3px_rgba(255,107,0,0.4)]"
                                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                                />
                            )}
                            <span className="relative z-10 flex items-center gap-2 md:gap-3 font-semibold text-xs md:text-sm whitespace-nowrap">
                                <i className="fa-solid fa-users w-4 md:w-5 text-center"></i> <span className="md:hidden">{team.replace('TEAM ', 'T')}</span><span className="hidden md:inline">{team}</span>
                                {activeTeam === team && <i className="hidden md:inline-block fa-solid fa-chevron-right ml-auto text-[10px]"></i>}
                            </span>
                        </a>
                    ))}
                </nav>
            </aside>

            {/* MAIN CONTENT AREA */}
            <main className="flex-1 flex flex-col overflow-y-auto relative" style={{ background: "url('/bg.png') no-repeat center center fixed", backgroundSize: 'cover' }}>
                
                {!activeTeam ? (
                    <div className="p-6 md:p-10 flex-1 relative z-10">
                        <div className="mb-8 md:mb-12">
                            <div className="flex flex-wrap items-center gap-2 mb-2">
                                <div className="w-8 h-1 bg-orange-500 rounded-full"></div>
                                <span className="text-[10px] md:text-xs font-bold text-gray-800 tracking-widest uppercase flex flex-wrap items-center gap-2">
                                    Live Auction
                                    {isPageLoading ? (
                                        <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full text-[9px] flex items-center gap-1 animate-pulse"><i className="fa-solid fa-circle-notch fa-spin"></i> CONNECTING</span>
                                    ) : isSyncing ? (
                                        <span className="bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full text-[9px] flex items-center gap-1 animate-pulse"><i className="fa-solid fa-arrows-rotate fa-spin"></i> SYNCING</span>
                                    ) : (
                                        <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full text-[9px] flex items-center gap-1"><i className="fa-solid fa-circle text-[6px] animate-pulse"></i> LIVE</span>
                                    )}
                                </span>
                            </div>
                            <h1 className="hero-font text-4xl md:text-5xl lg:text-6xl text-gray-900 tracking-tighter leading-none mb-1">
                                AUCTION <span className="text-orange-500">DASHBOARD</span>
                            </h1>
                            <p className="text-[10px] md:text-xs font-bold text-gray-400 uppercase tracking-widest">Franchise Overview</p>
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
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 max-w-7xl mx-auto pb-10">
                                {TEAMS.map(team => {
                                    const teamPlayers = players.filter(p => getNormalizedTeam(p.team) === getNormalizedTeam(team));
                                    const totalSpent = teamPlayers.reduce((sum, p) => sum + Number(p.bidAmount), 0);
                                    const purseLeft = TOTAL_PURSE - totalSpent;
                                    const percentUsed = Math.min(100, Math.round((totalSpent / TOTAL_PURSE) * 100));
                                    const theme = TEAM_THEMES[team] || { color: 'bg-gray-500', text: 'text-gray-500', from: 'from-gray-500', icon: 'fa-shield' };
                                    
                                    return (
                                        <div key={team} onClick={() => handleTeamClick(team)}
                                             className="bg-white rounded-[24px] p-6 shadow-sm border border-gray-100 hover:shadow-xl transition-all cursor-pointer relative overflow-hidden group">
                                            
                                        {/* Faint watermark on the right */}
                                        <div className={`absolute -bottom-4 -right-4 w-40 h-40 opacity-[0.04] group-hover:scale-110 group-hover:opacity-[0.08] transition-all pointer-events-none grayscale`}>
                                            <img src={theme.logo} className="w-full h-full object-contain" alt="" />
                                        </div>

                                            {/* Chevron icon top right */}
                                            <div className="absolute top-4 right-4 w-6 h-6 rounded-full bg-gray-50 flex items-center justify-center text-gray-400 group-hover:bg-gray-100 transition-colors shadow-sm">
                                                <i className="fa-solid fa-chevron-right text-[10px]"></i>
                                            </div>

                                            <div className="flex items-center gap-4 relative z-10 mb-6 mt-4">
                                                <img src={theme.logo} className="w-24 h-24 object-contain drop-shadow-md group-hover:scale-110 transition-transform -ml-2" alt={`${team} logo`} />
                                                <div>
                                                    <h3 className="text-xl font-black text-gray-900 uppercase tracking-tight leading-none">{team}</h3>
                                                    <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest mt-1.5">{teamPlayers.length + 2} MEMBERS SQUAD</p>
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
                                                    <div className={`h-full ${theme.color} rounded-full`} style={{ width: `${percentUsed}%` }}></div>
                                                </div>
                                                <p className="text-[9px] font-bold text-gray-400 mt-2">{percentUsed}% USED</p>
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
                            <div className="flex items-center gap-6">
                                <div className="bg-white/90 backdrop-blur px-6 py-3 rounded-2xl shadow-sm border border-gray-100 flex items-center gap-4 cursor-pointer hover:shadow transition">
                                    <div className="text-orange-500"><i className="fa-solid fa-tower-broadcast animate-pulse"></i></div>
                                    <div className="text-right">
                                        <p className="text-[9px] font-black text-gray-400 uppercase tracking-wider">Sports Spectra 4.0</p>
                                        <p className="text-xs font-bold text-gray-900">Live Updates</p>
                                    </div>
                                    <i className="fa-solid fa-arrow-right text-[10px] text-gray-300 ml-4"></i>
                                </div>
                                <div className="relative cursor-pointer hover:text-orange-500 transition">
                                    <i className="fa-regular fa-bell text-xl text-gray-400"></i>
                                    <span className="absolute -top-1 -right-1 bg-orange-500 w-2.5 h-2.5 rounded-full border-2 border-white"></span>
                                </div>
                            </div>
                        </div>

                        {isTeamLoading ? (
                            <div className="max-w-7xl mx-auto w-full animate-pulse">
                                {/* Top Banner Skeleton */}
                                <div className="h-32 bg-gray-200/60 rounded-[24px] mb-10 border border-gray-100"></div>
                                {/* Leader Cards Skeleton */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
                                    {[1, 2].map(i => (
                                        <div key={i} className="bg-white rounded-[40px] p-10 h-[400px] shadow-sm border border-gray-100">
                                            <div className="w-40 h-40 bg-gray-200/80 rounded-[32px] mx-auto mb-8"></div>
                                            <div className="w-48 h-8 bg-gray-200/80 rounded-full mx-auto mb-4"></div>
                                            <div className="w-32 h-4 bg-gray-200/80 rounded-full mx-auto"></div>
                                        </div>
                                    ))}
                                </div>
                                {/* Squad Grid Skeleton */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {[1, 2, 3, 4].map(i => (
                                        <div key={i} className="bg-white rounded-3xl p-4 flex items-center h-[96px] border border-gray-100">
                                            <div className="w-16 h-16 bg-gray-200/80 rounded-2xl mr-6"></div>
                                            <div className="flex-1">
                                                <div className="w-32 h-5 bg-gray-200/80 rounded mb-2"></div>
                                                <div className="w-24 h-3 bg-gray-200/80 rounded"></div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div className="max-w-7xl mx-auto w-full">
                                {(() => {
                            const teamPlayers = players.filter(p => getNormalizedTeam(p.team) === getNormalizedTeam(activeTeam));
                            const captainData = HARDCODED_LEADERS[activeTeam].captain;
                            const viceCaptainData = HARDCODED_LEADERS[activeTeam].viceCaptain;
                            const regulars = teamPlayers.filter(p => p.role === 'Player');
                            
                            const totalGirls = (captainData.gender === 'F' ? 1 : 0) + (viceCaptainData.gender === 'F' ? 1 : 0) + regulars.filter(p => p.gender === 'F').length;
                            const girlsRemaining = Math.max(0, 15 - totalGirls);
                            const totalSpent = teamPlayers.reduce((sum, p) => sum + Number(p.bidAmount), 0);
                            const purseLeft = TOTAL_PURSE - totalSpent;

                            return (
                                <>
                                    {/* TEAM INFO & STATS */}
                                    <div className="flex justify-between items-center mb-10 bg-orange-50/40 p-6 rounded-[24px] border border-orange-100/50 backdrop-blur-sm shadow-sm">
                                        <div>
                                            <h2 className="text-5xl font-black tracking-tighter text-gray-900">{activeTeam.toUpperCase()}</h2>
                                            <p className="text-orange-500 font-black text-xs uppercase tracking-[0.2em] mt-2">{teamPlayers.length + 2} PLAYERS SQUAD</p>
                                        </div>
                                        <div className="flex gap-4">
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

                                    {/* LEADERS SECTION */}
                                    <div className="grid grid-cols-2 gap-8 mb-10">
                                        {renderLeaderCard(captainData, 'CAPTAIN', 'fa-crown', captainData.color)}
                                        {renderLeaderCard(viceCaptainData, 'VICE CAPTAIN', 'fa-star', viceCaptainData.color)}
                                    </div>

                                    {/* PLAYERS TABLE */}
                                    <div className="bg-white/90 backdrop-blur-md rounded-3xl border border-gray-100 overflow-hidden shadow-xl shadow-gray-200/50">
                                        <div className="p-6 border-b border-gray-100 bg-white/50 flex items-center justify-between">
                                            <h3 className="font-bold text-lg text-gray-900"><i className="fa-solid fa-users text-orange-500 mr-2"></i> Squad Members</h3>
                                        </div>
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-left text-sm">
                                                <thead className="text-[10px] uppercase tracking-widest text-gray-400 bg-gray-50/80">
                                                    <tr>
                                                        <th className="px-8 py-5 font-bold">Player</th>
                                                        <th className="px-8 py-5 font-bold">Gender</th>
                                                        <th className="px-8 py-5 font-bold">Yr / Sec</th>
                                                        <th className="px-8 py-5 font-bold">Sports</th>
                                                        <th className="px-8 py-5 font-bold text-right">Bid (₹)</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-100/80">
                                                    {regulars.length === 0 ? (
                                                        <tr><td colSpan="5" className="px-8 py-16 text-center text-gray-400 font-medium bg-gray-50/30">No other players drafted yet.</td></tr>
                                                    ) : (
                                                        regulars.map((p, idx) => {
                                                            const avatar = p.photoUrl || ('https://ui-avatars.com/api/?name=' + encodeURIComponent(p.name) + '&background=random');
                                                            return (
                                                                <tr key={idx} className="hover:bg-orange-50/50 transition-colors group cursor-default">
                                                                    <td className="px-8 py-4 whitespace-nowrap">
                                                                        <div className="flex items-center gap-4">
                                                                            <img src={avatar} className="w-10 h-10 rounded-full bg-gray-200 object-cover shadow-sm group-hover:scale-110 transition-transform" />
                                                                            <span className="font-bold text-gray-900">{p.name}</span>
                                                                        </div>
                                                                    </td>
                                                                    <td className="px-8 py-4 text-gray-500 font-semibold">{p.gender}</td>
                                                                    <td className="px-8 py-4 text-gray-500 font-semibold">{p.year} / {p.section}</td>
                                                                    <td className="px-8 py-4 text-gray-500 text-xs font-medium uppercase tracking-wider">{p.sports}</td>
                                                                    <td className="px-8 py-4 font-black text-orange-500 text-right text-base">₹{Number(p.bidAmount).toLocaleString('en-IN')}</td>
                                                                </tr>
                                                            );
                                                        })
                                                    )}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                </>
                            );
                        })()}
                            </div>
                        )}
                    </div>
                )}
            </main>
        </div>
    );
}

export default Auction;
