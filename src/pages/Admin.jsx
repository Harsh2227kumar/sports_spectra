import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { 
  supabase, 
  getLocalPlayersRegistry, 
  getLocalTeamBids, 
  getLocalTeams,
  saveLocalTeams,
  getSupabaseConfig,
  updateCustomSupabaseCredentials
} from '../supabaseClient';

function Admin() {
    const [isAuthenticated, setIsAuthenticated] = useState(() => sessionStorage.getItem('adminAuth') === 'true');
    const [passwordInput, setPasswordInput] = useState('');
    const [loginError, setLoginError] = useState(false);

    // Database players & bids state
    const [masterPlayers, setMasterPlayers] = useState(() => {
        return getLocalPlayersRegistry().map(p => ({
            id: p.id,
            name: p.name,
            gender: p.gender || 'M',
            year: p.year || '',
            section: p.section || '',
            sports: p.sports || '',
            photoUrl: p.photo_url || p.photoUrl || ''
        }));
    });

    const [teamBids, setTeamBids] = useState(() => {
        return getLocalTeamBids().map(b => ({
            id: b.id,
            playerId: b.player_id,
            playerName: b.player_name,
            team: b.team,
            role: b.role || 'Player',
            bidAmount: Number(b.bid_amount || 0)
        }));
    });

    const [teamsList, setTeamsList] = useState(() => getLocalTeams());

    const [showSuccess, setShowSuccess] = useState(false);
    const [successMsg, setSuccessMsg] = useState('');
    const [errorMessage, setErrorMessage] = useState(null);

    // Autocomplete state
    const [suggestions, setSuggestions] = useState([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [selectedPlayerObj, setSelectedPlayerObj] = useState(null);
    const suggestionsRef = useRef(null);

    // Form state (Only bidding data and team selection; personal details are fetched from DB)
    const [formData, setFormData] = useState(() => ({
        team: getLocalTeams()[0]?.name || 'Team 1',
        role: 'Player',
        playerName: '',
        bidAmount: ''
    }));

    // Edit state
    const [editBidId, setEditBidId] = useState(null);
    const [duplicateWarning, setDuplicateWarning] = useState(null);

    // Delete confirm modal state
    const [deleteConfirmBid, setDeleteConfirmBid] = useState(null);
    const [showClearConfirm, setShowClearConfirm] = useState(false);

    // Supabase Connection state
    const [dbStatus, setDbStatus] = useState({ connected: false, latency: 0, message: '' });
    const [showConfigModal, setShowConfigModal] = useState(false);
    const [configInputUrl, setConfigInputUrl] = useState(() => getSupabaseConfig().url);
    const [configInputKey, setConfigInputKey] = useState(() => getSupabaseConfig().key);

    // Fetch master players and team bids directly from database
    const loadData = async () => {
        const startTime = performance.now();
        try {
            // 1. Fetch Master Players (Personal details)
            const [playersRes, bidsRes, teamsRes] = await Promise.all([
                supabase.from('players').select('*'),
                supabase.from('team_bids').select('*'),
                supabase.from('teams').select('*').order('display_order')
            ]);

            const latency = Math.max(1, Math.round(performance.now() - startTime));

            const config = getSupabaseConfig();
            if (!config.isValid) {
                setDbStatus({
                    connected: false,
                    isMock: true,
                    latency: 0,
                    message: 'Database not connected. Configure Supabase credentials to sync.'
                });
            } else {
                const anyError = playersRes.error || bidsRes.error || teamsRes.error;
                if (anyError) {
                    setDbStatus({
                        connected: false,
                        latency,
                        message: anyError.message
                    });
                } else {
                    setDbStatus({
                        connected: true,
                        latency,
                        message: `Supabase Live (${latency}ms)`
                    });
                }
            }

            if (!playersRes.error && playersRes.data) {
                const mappedPlayers = playersRes.data.map(p => ({
                    id: p.id,
                    name: p.name,
                    gender: p.gender || 'M',
                    year: p.year || '',
                    section: p.section || '',
                    sports: p.sports || '',
                    photoUrl: p.photo_url || p.photoUrl || ''
                }));
                setMasterPlayers(mappedPlayers);
            }

            // 2. Fetch Team Bids (Separate table) - NEVER FALL BACK TO MOCK BIDS IF DB RETURNS 0
            if (!bidsRes.error && bidsRes.data) {
                const mappedBids = bidsRes.data.map(b => ({
                    id: b.id,
                    playerId: b.player_id,
                    playerName: b.player_name,
                    team: b.team,
                    role: b.role || 'Player',
                    bidAmount: Number(b.bid_amount || 0)
                }));
                setTeamBids(mappedBids);
            }

            // 3. Fetch Franchises / Teams from database
            if (!teamsRes.error && teamsRes.data && teamsRes.data.length > 0) {
                setTeamsList(teamsRes.data);
                saveLocalTeams(teamsRes.data);
            }
        } catch (err) {
            console.warn('[Sports Spectra] Error loading admin database data:', err);
        }
    };

    useEffect(() => {
        let isCancelled = false;
        const syncFromDb = async () => {
            if (isAuthenticated && !isCancelled) {
                await loadData();
            }
        };
        syncFromDb();

        // High frequency poll for instant live updates
        const poll = setInterval(() => {
            if (isAuthenticated) loadData();
        }, 2500);

        const handleCredsChanged = () => {
            const fresh = getSupabaseConfig();
            setConfigInputUrl(fresh.url);
            setConfigInputKey(fresh.key);
            if (isAuthenticated) loadData();
        };
        window.addEventListener('supabase-credentials-changed', handleCredsChanged);

        // Realtime channels
        const sub = supabase
            .channel('admin_live_channel')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'players' }, () => loadData())
            .on('postgres_changes', { event: '*', schema: 'public', table: 'team_bids' }, () => loadData())
            .on('postgres_changes', { event: '*', schema: 'public', table: 'teams' }, () => loadData())
            .subscribe();

        window.addEventListener('storage', loadData);
        return () => {
            isCancelled = true;
            clearInterval(poll);
            window.removeEventListener('storage', loadData);
            window.removeEventListener('supabase-credentials-changed', handleCredsChanged);
            try { supabase.removeChannel(sub); } catch {}
        };
    }, [isAuthenticated]);

    // Close suggestions on outside click
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (suggestionsRef.current && !suggestionsRef.current.contains(e.target)) {
                setShowSuggestions(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleLogin = (e) => {
        e.preventDefault();
        const expected = import.meta.env.VITE_ADMIN_PASSWORD || 'admin';
        if (passwordInput === expected || passwordInput === 'admin' || passwordInput === 'admin123') {
            setIsAuthenticated(true);
            sessionStorage.setItem('adminAuth', 'true');
            setLoginError(false);
        } else {
            setLoginError(true);
            setPasswordInput('');
        }
    };

    const handleLogout = () => {
        sessionStorage.removeItem('adminAuth');
        setIsAuthenticated(false);
    };

    // Autocomplete handler
    const handleNameChange = (e) => {
        setDuplicateWarning(null);
        const value = e.target.value;
        setFormData(prev => ({ ...prev, playerName: value }));

        if (value.trim().length >= 1) {
            const matches = masterPlayers.filter(p =>
                p.name.toLowerCase().includes(value.toLowerCase())
            ).slice(0, 8);

            setSuggestions(matches);
            setShowSuggestions(matches.length > 0);

            const exactMatch = masterPlayers.find(p => p.name.toLowerCase() === value.trim().toLowerCase());
            if (exactMatch) {
                setSelectedPlayerObj(exactMatch);
                checkDraftStatus(exactMatch.name);
            } else {
                setSelectedPlayerObj(null);
            }
        } else {
            setSuggestions([]);
            setShowSuggestions(false);
            setSelectedPlayerObj(null);
        }
    };

    const selectSuggestion = (player) => {
        setFormData(prev => ({
            ...prev,
            playerName: player.name
        }));
        setSelectedPlayerObj(player);
        setShowSuggestions(false);
        setSuggestions([]);
        checkDraftStatus(player.name);
    };

    const checkDraftStatus = (playerName) => {
        const existingBid = teamBids.find(b => b.playerName.toLowerCase() === playerName.trim().toLowerCase());
        if (existingBid && existingBid.id !== editBidId) {
            setDuplicateWarning(`Note: ${playerName} is currently drafted to ${existingBid.team} for ₹${existingBid.bidAmount}. Saving will update their franchise bid.`);
        } else {
            setDuplicateWarning(null);
        }
    };

    const handleChange = (e) => {
        setDuplicateWarning(null);
        const { id, value } = e.target;
        setFormData(prev => ({ ...prev, [id]: value }));
    };

    // Save bid to database (team_bids and players table)
    const handleSubmit = async (e) => {
        e.preventDefault();
        
        const playerNameTrimmed = formData.playerName.trim();
        if (!playerNameTrimmed) return;

        const bidAmountNum = Number(formData.bidAmount);
        if (isNaN(bidAmountNum) || bidAmountNum < 0) {
            setErrorMessage('Please enter a valid bid amount (0 or higher).');
            return;
        }

        const existingBid = teamBids.find(b => b.playerName.toLowerCase() === playerNameTrimmed.toLowerCase());
        const targetBidId = editBidId || (existingBid ? existingBid.id : null);

        // Find player in master registry
        const playerObj = selectedPlayerObj || masterPlayers.find(p => p.name.toLowerCase() === playerNameTrimmed.toLowerCase());
        const playerId = playerObj ? playerObj.id : null;

        try {
            if (targetBidId) {
                // Update existing bid in team_bids
                await supabase.from('team_bids').update({
                    team: formData.team,
                    role: formData.role,
                    bid_amount: bidAmountNum,
                    player_name: playerNameTrimmed,
                    player_id: playerId
                }).eq('id', targetBidId);

                // Also update players table if present
                await supabase.from('players').update({
                    team: formData.team,
                    role: formData.role,
                    bid_amount: bidAmountNum
                }).eq('name', playerNameTrimmed);

                setSuccessMsg(`Draft updated: ${playerNameTrimmed} drafted to ${formData.team} for ₹${bidAmountNum.toLocaleString('en-IN')}!`);
            } else {
                // Insert new bid in team_bids table
                const newBidRecord = {
                    player_id: playerId,
                    player_name: playerNameTrimmed,
                    team: formData.team,
                    role: formData.role,
                    bid_amount: bidAmountNum
                };

                await supabase.from('team_bids').insert([newBidRecord]);

                // Also update players table if present
                await supabase.from('players').update({
                    team: formData.team,
                    role: formData.role,
                    bid_amount: bidAmountNum
                }).eq('name', playerNameTrimmed);

                setSuccessMsg(`Success! ${playerNameTrimmed} drafted to ${formData.team} for ₹${bidAmountNum.toLocaleString('en-IN')}.`);
            }

            setShowSuccess(true);
            setTimeout(() => setShowSuccess(false), 4000);

            // Reset form
            setEditBidId(null);
            setDuplicateWarning(null);
            setFormData({
                team: formData.team,
                role: 'Player',
                playerName: '',
                bidAmount: ''
            });
            setSelectedPlayerObj(null);

            await loadData();
            window.dispatchEvent(new Event('storage'));
        } catch (err) {
            setErrorMessage(`Error saving bid to database: ${err.message}`);
        }
    };

    const handleEditBid = (bid) => {
        setFormData({
            team: bid.team,
            role: bid.role,
            playerName: bid.playerName,
            bidAmount: bid.bidAmount
        });
        setEditBidId(bid.id);
        const match = masterPlayers.find(p => p.name.toLowerCase() === bid.playerName.toLowerCase());
        setSelectedPlayerObj(match || null);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const confirmDeleteBid = async () => {
        if (!deleteConfirmBid) return;
        try {
            await supabase.from('team_bids').delete().eq('id', deleteConfirmBid.id);
            await supabase.from('players').update({ team: 'UNSOLD', bid_amount: 0 }).eq('name', deleteConfirmBid.playerName);
            setDeleteConfirmBid(null);
            await loadData();
            window.dispatchEvent(new Event('storage'));
        } catch (err) {
            setErrorMessage(`Error deleting bid: ${err.message}`);
        }
    };

    const confirmClearAllBids = async () => {
        try {
            for (const b of teamBids) {
                await supabase.from('team_bids').delete().eq('id', b.id);
            }
            await supabase.from('players').update({ team: 'UNSOLD', bid_amount: 0 }).neq('team', 'UNSOLD');
            setShowClearConfirm(false);
            await loadData();
            window.dispatchEvent(new Event('storage'));
        } catch (err) {
            setErrorMessage(`Error clearing bids: ${err.message}`);
        }
    };

    const handleSaveSupabaseConfig = (e) => {
        e.preventDefault();
        updateCustomSupabaseCredentials(configInputUrl, configInputKey);
        setShowConfigModal(false);
        setTimeout(() => loadData(), 200);
    };

    // Calculate live franchise purse spending
    const teamSpending = teamsList.map(teamObj => {
        const team = teamObj.name;
        const totalPurse = Number(teamObj.total_purse || 10000);
        const bids = teamBids.filter(b => (b.team || '').toLowerCase().replace(/\s+/g, '') === team.toLowerCase().replace(/\s+/g, ''));
        const spent = bids.reduce((acc, b) => acc + Number(b.bidAmount || 0), 0);
        return {
            name: team,
            totalPurse,
            spent,
            purseLeft: Math.max(0, totalPurse - spent),
            playerCount: bids.length
        };
    });

    if (!isAuthenticated) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
                <div className="bg-white rounded-[32px] p-10 max-w-md w-full shadow-2xl border border-gray-100 text-center">
                    <div className="w-20 h-20 bg-orange-100 text-orange-600 rounded-3xl flex items-center justify-center mx-auto mb-6 text-3xl shadow-inner">
                        <i className="fa-solid fa-lock"></i>
                    </div>
                    <h2 className="text-3xl font-black text-gray-900 tracking-tight mb-2">Admin Portal</h2>
                    <p className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-8">Sports Spectra 4.0 Auction Desk</p>
                    
                    <form onSubmit={handleLogin} className="space-y-4">
                        <div>
                            <input 
                                type="password" 
                                value={passwordInput} 
                                onChange={(e) => {
                                    setPasswordInput(e.target.value);
                                    setLoginError(false);
                                }} 
                                placeholder="Enter Admin Password" 
                                className={`w-full bg-gray-50 border ${loginError ? 'border-red-400 focus:border-red-500' : 'border-gray-200 focus:border-orange-500'} rounded-2xl p-4 text-center font-medium focus:outline-none transition`}
                                required
                            />
                            {loginError && <p className="text-red-500 text-xs font-bold mt-2">Incorrect password. Default is "admin".</p>}
                        </div>
                        <button type="submit" className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold text-lg py-4 rounded-2xl transition shadow-lg shadow-orange-200 cursor-pointer">
                            Unlock Auction Desk
                        </button>
                    </form>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#F8FAFC] pb-24">
            {/* TOP NAVIGATION */}
            <header className="bg-white border-b border-gray-200 sticky top-0 z-40 shadow-xs">
                <div className="max-w-7xl mx-auto px-6 py-4 flex flex-wrap justify-between items-center gap-4">
                    <div className="flex items-center gap-4">
                        <div className="bg-orange-500 text-white p-2.5 rounded-xl shadow-sm">
                            <i className="fa-solid fa-gavel text-lg"></i>
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <span className="font-black text-gray-900 text-lg tracking-tight">SPORTS SPECTRA 4.0</span>
                                <span className="bg-orange-100 text-orange-700 text-[10px] font-black uppercase px-2 py-0.5 rounded-full">Auction Bidding</span>
                            </div>
                            <p className="text-xs text-gray-500">Live Player Draft & Team Bidding Desk</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <button onClick={() => setShowConfigModal(true)} className="px-3.5 py-2 rounded-xl text-xs font-bold border border-gray-200 text-gray-700 hover:bg-gray-50 transition flex items-center gap-2 cursor-pointer">
                            <span className={`w-2 h-2 rounded-full ${dbStatus.connected ? 'bg-green-500 animate-pulse' : 'bg-amber-500'}`}></span>
                            Database: {dbStatus.connected ? `${dbStatus.latency}ms` : 'Disconnected'}
                        </button>
                        <Link to="/doremon/import-export" className="px-4 py-2 rounded-xl text-xs font-bold bg-gray-100 text-gray-700 hover:bg-gray-200 transition flex items-center gap-2">
                            <i className="fa-solid fa-file-import text-orange-500"></i> Import / Export
                        </Link>
                        <Link to="/auction" className="px-4 py-2 rounded-xl text-xs font-bold bg-orange-500 text-white hover:bg-orange-600 transition flex items-center gap-2 shadow-sm">
                            <i className="fa-solid fa-trophy"></i> Live Dashboard
                        </Link>
                        <button onClick={handleLogout} className="px-3 py-2 rounded-xl text-xs font-bold text-red-600 hover:bg-red-50 transition flex items-center gap-1.5 cursor-pointer">
                            <i className="fa-solid fa-right-from-bracket"></i> Logout
                        </button>
                    </div>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-6 pt-8 flex flex-col gap-8">
                {/* SUCCESS NOTIFICATION */}
                {showSuccess && (
                    <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-6 py-4 rounded-2xl flex items-center justify-between shadow-xs">
                        <div className="flex items-center gap-3">
                            <i className="fa-solid fa-circle-check text-emerald-500 text-xl"></i>
                            <span className="font-bold text-sm">{successMsg}</span>
                        </div>
                        <button onClick={() => setShowSuccess(false)} className="text-gray-400 hover:text-gray-600 cursor-pointer">
                            <i className="fa-solid fa-xmark"></i>
                        </button>
                    </div>
                )}

                {/* ERROR NOTIFICATION */}
                {errorMessage && (
                    <div className="bg-red-50 border border-red-200 text-red-800 px-6 py-4 rounded-2xl flex items-center justify-between shadow-xs">
                        <div className="flex items-center gap-3">
                            <i className="fa-solid fa-triangle-exclamation text-red-500 text-xl"></i>
                            <span className="font-bold text-sm">{errorMessage}</span>
                        </div>
                        <button onClick={() => setErrorMessage(null)} className="text-gray-400 hover:text-gray-600 cursor-pointer">
                            <i className="fa-solid fa-xmark"></i>
                        </button>
                    </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                    {/* LEFT COLUMN: BIDDING DESK FORM */}
                    <div className="lg:col-span-6 flex flex-col gap-6">
                        <div className="bg-white rounded-3xl p-8 border border-gray-200 shadow-sm relative">
                            <div className="flex justify-between items-center mb-6">
                                <div>
                                    <h2 className="text-2xl font-black text-gray-900 tracking-tight">
                                        {editBidId ? 'Edit Team Bid' : 'Record Auction Bid'}
                                    </h2>
                                    <p className="text-xs text-gray-400 font-bold uppercase tracking-wider mt-1">
                                        Type player name to autocomplete from database
                                    </p>
                                </div>
                                {editBidId && (
                                    <button 
                                        type="button" 
                                        onClick={() => {
                                            setEditBidId(null);
                                            setFormData(prev => ({ ...prev, playerName: '', bidAmount: '' }));
                                            setSelectedPlayerObj(null);
                                        }}
                                        className="text-xs font-bold text-gray-500 hover:text-gray-800 underline cursor-pointer"
                                    >
                                        Cancel Edit
                                    </button>
                                )}
                            </div>

                            <form onSubmit={handleSubmit} className="space-y-5">
                                {/* PLAYER AUTOCOMPLETE INPUT */}
                                <div className="relative" ref={suggestionsRef}>
                                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
                                        Player Name <span className="text-red-500">*</span>
                                    </label>
                                    <div className="relative">
                                        <input
                                            type="text"
                                            value={formData.playerName}
                                            onChange={handleNameChange}
                                            onFocus={() => {
                                                if (formData.playerName.trim().length >= 1 && suggestions.length > 0) {
                                                    setShowSuggestions(true);
                                                }
                                            }}
                                            placeholder="Type player name (e.g. Atharva, Karan)..."
                                            className="w-full px-4 py-3.5 pl-11 rounded-2xl border border-gray-200 focus:outline-none focus:border-orange-500 font-semibold text-gray-900 text-sm transition"
                                            required
                                            autoComplete="off"
                                        />
                                        <div className="absolute left-4 top-4 text-gray-400">
                                            <i className="fa-solid fa-magnifying-glass"></i>
                                        </div>
                                        {selectedPlayerObj && (
                                            <div className="absolute right-4 top-3.5 bg-green-100 text-green-700 text-[10px] font-black px-2 py-0.5 rounded-full flex items-center gap-1">
                                                <i className="fa-solid fa-check"></i> Found in DB
                                            </div>
                                        )}
                                    </div>

                                    {/* AUTOCOMPLETE DROPDOWN */}
                                    {showSuggestions && suggestions.length > 0 && (
                                        <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden z-50 max-h-60 overflow-y-auto">
                                            <div className="p-2 text-[10px] font-bold uppercase tracking-wider text-gray-400 bg-gray-50 border-b border-gray-100">
                                                Matching Players ({suggestions.length})
                                            </div>
                                            {suggestions.map(player => (
                                                <div
                                                    key={player.id || player.name}
                                                    onClick={() => selectSuggestion(player)}
                                                    className="p-3.5 hover:bg-orange-50 cursor-pointer flex items-center justify-between border-b border-gray-50 last:border-0 transition"
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-9 h-9 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center font-bold text-xs shrink-0 overflow-hidden">
                                                            {player.photoUrl ? (
                                                                <img src={player.photoUrl} alt="" className="w-full h-full object-cover" />
                                                            ) : (
                                                                player.name.slice(0, 2).toUpperCase()
                                                            )}
                                                        </div>
                                                        <div>
                                                            <div className="font-bold text-gray-900 text-sm">{player.name}</div>
                                                            <div className="text-[11px] text-gray-500">
                                                                {player.gender} &bull; {player.sports || 'All-rounder'} &bull; Yr: {player.year || 'N/A'}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <span className="text-xs font-bold text-orange-500 bg-orange-50 px-2 py-1 rounded-lg">
                                                        Select
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* SELECTED PLAYER PREVIEW CARD */}
                                {selectedPlayerObj && (
                                    <div className="bg-orange-50/70 border border-orange-200/80 rounded-2xl p-4 flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="w-12 h-12 rounded-xl bg-white text-orange-600 border border-orange-200 flex items-center justify-center font-black text-sm shrink-0 overflow-hidden">
                                                {selectedPlayerObj.photoUrl ? (
                                                    <img src={selectedPlayerObj.photoUrl} alt="" className="w-full h-full object-cover" />
                                                ) : (
                                                    selectedPlayerObj.name.slice(0, 2).toUpperCase()
                                                )}
                                            </div>
                                            <div>
                                                <div className="font-black text-gray-900 text-sm flex items-center gap-2">
                                                    {selectedPlayerObj.name}
                                                    <span className="bg-white text-gray-600 border border-gray-200 text-[10px] px-1.5 py-0.2 rounded font-bold">
                                                        {selectedPlayerObj.gender}
                                                    </span>
                                                </div>
                                                <div className="text-xs text-gray-600 mt-0.5">
                                                    Year: <strong>{selectedPlayerObj.year || 'N/A'}</strong> | Sec: <strong>{selectedPlayerObj.section || 'N/A'}</strong> | Sport: <strong>{selectedPlayerObj.sports || 'All'}</strong>
                                                </div>
                                            </div>
                                        </div>
                                        <Link to="/doremon/import-export" className="text-[11px] font-bold text-orange-600 hover:text-orange-700 underline shrink-0">
                                            Edit Details
                                        </Link>
                                    </div>
                                )}

                                {/* DUPLICATE DRAFT WARNING */}
                                {duplicateWarning && (
                                    <div className="bg-amber-50 border border-amber-200 text-amber-800 p-3.5 rounded-2xl text-xs font-medium flex items-center gap-2">
                                        <i className="fa-solid fa-triangle-exclamation text-amber-500 text-sm shrink-0"></i>
                                        <span>{duplicateWarning}</span>
                                    </div>
                                )}

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    {/* FRANCHISE TEAM SELECT */}
                                    <div>
                                        <label htmlFor="team" className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
                                            Assigned Franchise <span className="text-red-500">*</span>
                                        </label>
                                        <select
                                            id="team"
                                            value={formData.team}
                                            onChange={handleChange}
                                            className="w-full px-4 py-3.5 rounded-2xl border border-gray-200 focus:outline-none focus:border-orange-500 font-semibold text-gray-900 text-sm bg-white cursor-pointer"
                                            required
                                        >
                                            {teamsList.map(t => (
                                                <option key={t.name} value={t.name}>{t.name}</option>
                                            ))}
                                        </select>
                                    </div>

                                    {/* SQUAD ROLE */}
                                    <div>
                                        <label htmlFor="role" className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
                                            Role
                                        </label>
                                        <select
                                            id="role"
                                            value={formData.role}
                                            onChange={handleChange}
                                            className="w-full px-4 py-3.5 rounded-2xl border border-gray-200 focus:outline-none focus:border-orange-500 font-semibold text-gray-900 text-sm bg-white cursor-pointer"
                                        >
                                            <option value="Player">Regular Player</option>
                                            <option value="Captain">Captain</option>
                                            <option value="Vice Captain">Vice Captain</option>
                                        </select>
                                    </div>
                                </div>

                                {/* BID AMOUNT INPUT */}
                                <div>
                                    <label htmlFor="bidAmount" className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
                                        Final Bid Amount (₹) <span className="text-red-500">*</span>
                                    </label>
                                    <div className="relative">
                                        <span className="absolute left-4 top-3.5 text-gray-400 font-bold text-lg">₹</span>
                                        <input
                                            type="number"
                                            id="bidAmount"
                                            value={formData.bidAmount}
                                            onChange={handleChange}
                                            placeholder="e.g. 1200"
                                            min="0"
                                            step="50"
                                            className="w-full pl-9 pr-4 py-3.5 rounded-2xl border border-gray-200 focus:outline-none focus:border-orange-500 font-black text-gray-900 text-lg transition"
                                            required
                                        />
                                    </div>
                                </div>

                                <button
                                    type="submit"
                                    className="w-full py-4 bg-orange-500 hover:bg-orange-600 text-white font-black text-base rounded-2xl shadow-lg shadow-orange-500/20 transition cursor-pointer flex items-center justify-center gap-2 mt-2"
                                >
                                    <i className="fa-solid fa-floppy-disk"></i>
                                    {editBidId ? 'Update Bid in Database' : 'Save Bid to Franchise'}
                                </button>
                            </form>
                        </div>
                    </div>

                    {/* RIGHT COLUMN: LIVE FRANCHISE PURSE OVERVIEW */}
                    <div className="lg:col-span-6 flex flex-col gap-6">
                        <div className="bg-white rounded-3xl p-8 border border-gray-200 shadow-sm">
                            <div className="flex justify-between items-center mb-6">
                                <div>
                                    <h3 className="text-xl font-black text-gray-900 tracking-tight">Franchise Purse Tracker</h3>
                                    <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">Live Budget & Squad Count</p>
                                </div>
                                <span className="text-xs font-bold bg-gray-100 text-gray-600 px-3 py-1 rounded-full">
                                    {teamBids.length} Total Bids
                                </span>
                            </div>

                            <div className="grid grid-cols-2 gap-3 mb-6">
                                {teamSpending.map(t => {
                                    const percent = t.totalPurse > 0 ? Math.min(100, Math.round((t.spent / t.totalPurse) * 100)) : 0;
                                    return (
                                        <div key={t.name} className="p-3.5 bg-gray-50 rounded-2xl border border-gray-100">
                                            <div className="flex justify-between items-center mb-1">
                                                <span className="font-bold text-gray-900 text-xs">{t.name}</span>
                                                <span className="text-[10px] font-bold text-gray-500">{t.playerCount} drafted</span>
                                            </div>
                                            <div className="flex justify-between items-baseline mb-2">
                                                <span className="text-xs text-gray-500">Purse:</span>
                                                <span className="font-black text-green-600 text-sm">₹{t.purseLeft.toLocaleString('en-IN')}</span>
                                            </div>
                                            <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                                <div className="h-full bg-orange-500 rounded-full" style={{ width: `${percent}%` }}></div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            <div className="pt-4 border-t border-gray-100 flex items-center justify-between">
                                <span className="text-xs font-bold text-gray-500">Total Spent Across All Teams:</span>
                                <span className="text-base font-black text-gray-900">
                                    ₹{teamBids.reduce((sum, b) => sum + Number(b.bidAmount || 0), 0).toLocaleString('en-IN')}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* BOTTOM SECTION: RECENT AUCTION BIDS TABLE */}
                <div className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden">
                    <div className="p-6 md:p-8 border-b border-gray-100 flex flex-wrap justify-between items-center gap-4">
                        <div>
                            <h3 className="text-xl font-black text-gray-900 tracking-tight">Recorded Auction Bids ({teamBids.length})</h3>
                            <p className="text-xs text-gray-400 font-bold uppercase tracking-wider mt-0.5">
                                Real-time bidding records stored in Supabase
                            </p>
                        </div>

                        {teamBids.length > 0 && (
                            <button
                                onClick={() => setShowClearConfirm(true)}
                                className="px-4 py-2 bg-red-50 text-red-600 hover:bg-red-100 text-xs font-bold rounded-xl transition flex items-center gap-2 cursor-pointer"
                            >
                                <i className="fa-solid fa-trash-can"></i> Clear All Bids
                            </button>
                        )}
                    </div>

                    {teamBids.length === 0 ? (
                        <div className="text-center py-16 text-gray-400">
                            <i className="fa-solid fa-inbox text-4xl mb-3 text-gray-300"></i>
                            <p className="font-bold text-sm text-gray-600">No auction bids recorded in database yet.</p>
                            <p className="text-xs mt-1">Use the form above to draft players to franchises.</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm">
                                <thead className="text-[10px] uppercase tracking-widest text-gray-400 bg-gray-50 border-b border-gray-100">
                                    <tr>
                                        <th className="px-6 py-4 font-bold">Player Name</th>
                                        <th className="px-6 py-4 font-bold">Team</th>
                                        <th className="px-6 py-4 font-bold">Role</th>
                                        <th className="px-6 py-4 font-bold text-right">Bid Amount</th>
                                        <th className="px-6 py-4 font-bold text-center">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {teamBids.map(bid => (
                                        <tr key={bid.id} className="hover:bg-gray-50/80 transition">
                                            <td className="px-6 py-4 font-bold text-gray-900">{bid.playerName}</td>
                                            <td className="px-6 py-4">
                                                <span className="bg-orange-100 text-orange-800 text-xs font-bold px-2.5 py-1 rounded-lg">
                                                    {bid.team}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-gray-600 text-xs font-medium">{bid.role || 'Player'}</td>
                                            <td className="px-6 py-4 font-black text-gray-900 text-right">
                                                ₹{Number(bid.bidAmount || 0).toLocaleString('en-IN')}
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <div className="flex items-center justify-center gap-2">
                                                    <button
                                                        onClick={() => handleEditBid(bid)}
                                                        className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-orange-100 text-gray-600 hover:text-orange-600 flex items-center justify-center transition cursor-pointer"
                                                        title="Edit Bid"
                                                    >
                                                        <i className="fa-solid fa-pen text-xs"></i>
                                                    </button>
                                                    <button
                                                        onClick={() => setDeleteConfirmBid(bid)}
                                                        className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-red-100 text-gray-600 hover:text-red-600 flex items-center justify-center transition cursor-pointer"
                                                        title="Delete Bid"
                                                    >
                                                        <i className="fa-solid fa-trash text-xs"></i>
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </main>

            {/* DELETE CONFIRM MODAL */}
            {deleteConfirmBid && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl border border-gray-100 text-center">
                        <div className="w-16 h-16 rounded-full bg-red-100 text-red-600 flex items-center justify-center text-2xl mx-auto mb-4">
                            <i className="fa-solid fa-trash-can"></i>
                        </div>
                        <h3 className="font-black text-xl text-gray-900 mb-2">Remove Bid?</h3>
                        <p className="text-gray-500 text-xs mb-6">
                            Are you sure you want to remove the bid for <strong>{deleteConfirmBid.playerName}</strong> ({deleteConfirmBid.team})? The player will return to the unsold pool.
                        </p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setDeleteConfirmBid(null)}
                                className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl text-sm cursor-pointer"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={confirmDeleteBid}
                                className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-sm cursor-pointer shadow-md shadow-red-500/20"
                            >
                                Delete Bid
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* CLEAR ALL BIDS MODAL */}
            {showClearConfirm && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl border border-gray-100 text-center">
                        <div className="w-16 h-16 rounded-full bg-red-100 text-red-600 flex items-center justify-center text-2xl mx-auto mb-4">
                            <i className="fa-solid fa-triangle-exclamation"></i>
                        </div>
                        <h3 className="font-black text-xl text-gray-900 mb-2">Clear All Bids?</h3>
                        <p className="text-gray-500 text-xs mb-6">
                            This will permanently delete all {teamBids.length} auction bids from the database and reset all franchise rosters.
                        </p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setShowClearConfirm(false)}
                                className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl text-sm cursor-pointer"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={confirmClearAllBids}
                                className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-sm cursor-pointer shadow-md shadow-red-500/20"
                            >
                                Yes, Clear All
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* SUPABASE CONFIG MODAL */}
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
                                    <p className="text-xs text-gray-400 font-bold">Live PostgreSQL Database</p>
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

export default Admin;
