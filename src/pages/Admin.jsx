import React, { useState, useEffect, useRef } from 'react';
import Papa from 'papaparse';

function Admin() {
    const [players, setPlayers] = useState([]);
    const [showSuccess, setShowSuccess] = useState(false);
    
    // Excel imported data
    const [excelData, setExcelData] = useState(() => {
        const saved = localStorage.getItem('importedExcelData');
        return saved ? JSON.parse(saved) : [];
    });
    const [excelFileName, setExcelFileName] = useState(() => {
        return localStorage.getItem('importedExcelFileName') || '';
    });

    // Autocomplete state
    const [suggestions, setSuggestions] = useState([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const suggestionsRef = useRef(null);
    const fileInputRef = useRef(null);
    
    // Form state
    const [formData, setFormData] = useState({
        team: 'TEAM 1',
        role: 'Player',
        playerName: '',
        gender: 'M',
        year: '',
        section: '',
        sports: '',
        bidAmount: '',
        photoUrl: ''
    });

    // Edit state
    const [editPlayerId, setEditPlayerId] = useState(null);
    const [duplicateError, setDuplicateError] = useState(null);

    useEffect(() => {
        const loadPlayers = () => {
            setPlayers(JSON.parse(localStorage.getItem('auctionPlayers') || '[]'));
        };
        loadPlayers();
        window.addEventListener('storage', loadPlayers);

        const fetchLivePlayers = async () => {
            const appsScriptUrl = import.meta.env.VITE_APPS_SCRIPT_URL || localStorage.getItem('appsScriptUrl');
            if (appsScriptUrl) {
                try {
                    const res = await fetch(appsScriptUrl);
                    if (res.ok) {
                        const data = await res.json();
                        if (data.success && data.players) {
                            localStorage.setItem('auctionPlayers', JSON.stringify(data.players));
                            setPlayers(data.players);
                        }
                    }
                } catch (e) {
                    console.error("Failed to fetch live players from Google Sheets", e);
                }
            }
        };
        fetchLivePlayers();

        return () => window.removeEventListener('storage', loadPlayers);
    }, []);

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

    const [syncing, setSyncing] = useState(false);
    const [sheetUrl, setSheetUrl] = useState(() => import.meta.env.VITE_GOOGLE_SHEET_URL || localStorage.getItem('googleSheetUrl') || 'https://docs.google.com/spreadsheets/d/1gEltu_tQEzwk5xRWkvhhOLmIhhlUc4DmjQNjo26WB9s/edit?gid=0#gid=0');
    const [appsScriptUrl, setAppsScriptUrl] = useState(() => import.meta.env.VITE_APPS_SCRIPT_URL || localStorage.getItem('appsScriptUrl') || '');

    // Handle Google Sheets Sync
    const handleSheetSync = async () => {
        if (!sheetUrl) return;
        setSyncing(true);
        try {
            const match = sheetUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
            if (!match) throw new Error("Invalid Google Sheets URL");
            
            const sheetId = match[1];
            // Using the export endpoint
            const exportUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`;

            const res = await fetch(exportUrl);
            if (!res.ok) {
                if (res.status === 401 || res.status === 403) {
                    throw new Error("Access Denied! Please open your Google Sheet, click 'Share' in the top right, and change 'Restricted' to 'Anyone with the link'.");
                }
                throw new Error("Failed to fetch the spreadsheet.");
            }
            
            const csvText = await res.text();
            
            Papa.parse(csvText, {
                header: true,
                skipEmptyLines: true,
                complete: (results) => {
                    const rawData = results.data;
                    const normalized = rawData.map(row => {
                        const obj = {};
                        for (const key of Object.keys(row)) {
                            const k = key.trim().toLowerCase();
                            if (k === 'name' || k === 'player name' || k === 'playername') obj.name = String(row[key]).trim();
                            else if (k === 'gender' || k === 'sex') obj.gender = String(row[key]).trim().toUpperCase().charAt(0);
                            else if (k === 'year' || k === 'yr') obj.year = String(row[key]).trim();
                            else if (k === 'section' || k === 'sec') obj.section = String(row[key]).trim();
                            else if (k === 'sport 1' || k === 'sport1' || k === 'sports') obj.sport1 = String(row[key]).trim();
                            else if (k === 'sport 2' || k === 'sport2') obj.sport2 = String(row[key]).trim();
                            else if (k === 'photo' || k === 'photo url' || k === 'photourl' || k === 'image') obj.photo = String(row[key]).trim();
                        }
                        const sports = [obj.sport1, obj.sport2].filter(Boolean).join(', ');
                        return { ...obj, sports };
                    }).filter(row => row.name);

                    setExcelData(normalized);
                    setExcelFileName("Live Google Sheet");
                    localStorage.setItem('importedExcelData', JSON.stringify(normalized));
                    localStorage.setItem('importedExcelFileName', "Live Google Sheet");
                    localStorage.setItem('googleSheetUrl', sheetUrl);
                    alert(`Successfully synced ${normalized.length} players from Google Sheets!`);
                },
                error: (error) => {
                    throw new Error("Error parsing CSV: " + error.message);
                }
            });
        } catch (err) {
            if (err.message.includes("Failed to fetch") || err.name === 'TypeError') {
                alert("Connection blocked! This almost always means the Google Sheet is still Private.\n\nPlease go to Share -> Change to 'Anyone with the link can view', and try again. (Google blocked it because it tried to redirect you to a login page).");
            } else {
                alert(err.message);
            }
        } finally {
            setSyncing(false);
        }
    };

    // Handle player name input change with autocomplete
    const handleNameChange = (e) => {
        setDuplicateError(null);
        const value = e.target.value;
        setFormData(prev => ({ ...prev, playerName: value }));

        if (value.length >= 2 && excelData.length > 0) {
            const matches = excelData.filter(p =>
                p.name.toLowerCase().includes(value.toLowerCase())
            ).slice(0, 8);
            setSuggestions(matches);
            setShowSuggestions(matches.length > 0);
        } else {
            setSuggestions([]);
            setShowSuggestions(false);
        }
    };

    // Autofill form from selected suggestion
    const selectSuggestion = (player) => {
        setFormData(prev => ({
            ...prev,
            playerName: player.name || prev.playerName,
            gender: (player.gender === 'M' || player.gender === 'F') ? player.gender : prev.gender,
            year: player.year || prev.year,
            section: player.section || prev.section,
            sports: player.sports || prev.sports,
            photoUrl: player.photo || prev.photoUrl
        }));
        setShowSuggestions(false);
        setSuggestions([]);
    };

    const handleChange = (e) => {
        setDuplicateError(null);
        const { id, value } = e.target;
        setFormData(prev => ({ ...prev, [id]: value }));
    };

    const syncToGoogleSheets = (playerData, action) => {
        if (!appsScriptUrl) return;
        fetch(appsScriptUrl, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: action, // 'add', 'edit', 'delete'
                team: playerData.team,
                name: playerData.name,
                role: playerData.role,
                gender: playerData.gender,
                year: playerData.year,
                section: playerData.section,
                sports: playerData.sports,
                bidAmount: playerData.bidAmount,
                photoUrl: playerData.photoUrl
            })
        }).catch(err => console.error("Failed to post to Google Sheets", err));
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        
        const currentPlayers = JSON.parse(localStorage.getItem('auctionPlayers') || '[]');
        
        if (editPlayerId) {
            // Update existing player
            let editedPlayer = null;
            const updatedPlayers = currentPlayers.map(p => {
                if (p.id === editPlayerId) {
                    editedPlayer = {
                        ...p,
                        team: formData.team,
                        role: formData.role,
                        name: formData.playerName,
                        gender: formData.gender,
                        year: formData.year,
                        section: formData.section,
                        sports: formData.sports,
                        bidAmount: formData.bidAmount,
                        photoUrl: formData.photoUrl || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(formData.playerName) + '&background=random'
                    };
                    return editedPlayer;
                }
                return p;
            });
            localStorage.setItem('auctionPlayers', JSON.stringify(updatedPlayers));
            setPlayers(updatedPlayers);
            setEditPlayerId(null);
            
            if (editedPlayer) {
                syncToGoogleSheets(editedPlayer, 'edit');
            }
        } else {
            // Check if player is already drafted
            const alreadyDrafted = currentPlayers.find(p => p.name.toLowerCase() === formData.playerName.trim().toLowerCase());
            if (alreadyDrafted) {
                setDuplicateError(`Cannot add duplicate! ${formData.playerName} has already been drafted to ${alreadyDrafted.team}.`);
                return;
            }

            // Add new player
            const player = {
                id: Date.now(),
                team: formData.team,
                role: formData.role,
                name: formData.playerName,
                gender: formData.gender,
                year: formData.year,
                section: formData.section,
                sports: formData.sports,
                bidAmount: formData.bidAmount,
                photoUrl: formData.photoUrl || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(formData.playerName) + '&background=random'
            };

            if (player.role !== 'Player') {
                const existingIndex = currentPlayers.findIndex(p => p.team === player.team && p.role === player.role);
                if(existingIndex > -1) currentPlayers.splice(existingIndex, 1);
            }

            currentPlayers.push(player);
            localStorage.setItem('auctionPlayers', JSON.stringify(currentPlayers));
            setPlayers(currentPlayers);

            // Send to Google Sheets via Apps Script Web App
            syncToGoogleSheets(player, 'add');
        }

        setShowSuccess(true);
        setTimeout(() => setShowSuccess(false), 3000);
        
        setFormData({
            team: 'TEAM 1',
            role: 'Player',
            playerName: '',
            gender: 'M',
            year: '',
            section: '',
            sports: '',
            bidAmount: '',
            photoUrl: ''
        });
        
        window.dispatchEvent(new Event('storage'));
    };

    const handleEdit = (player) => {
        setFormData({
            team: player.team,
            role: player.role,
            playerName: player.name,
            gender: player.gender,
            year: player.year,
            section: player.section,
            sports: player.sports,
            bidAmount: player.bidAmount,
            photoUrl: player.photoUrl.includes('ui-avatars') ? '' : player.photoUrl
        });
        setEditPlayerId(player.id);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleDelete = (playerId) => {
        if(window.confirm("Are you sure you want to remove this player?")) {
            const currentPlayers = JSON.parse(localStorage.getItem('auctionPlayers') || '[]');
            const playerToDelete = currentPlayers.find(p => p.id === playerId);
            const updatedPlayers = currentPlayers.filter(p => p.id !== playerId);
            localStorage.setItem('auctionPlayers', JSON.stringify(updatedPlayers));
            setPlayers(updatedPlayers);
            window.dispatchEvent(new Event('storage'));
            
            if (playerToDelete) {
                syncToGoogleSheets(playerToDelete, 'delete');
            }
        }
    };

    const clearData = () => {
        if(window.confirm("Are you sure you want to delete all auction data?")) {
            localStorage.removeItem('auctionPlayers');
            setPlayers([]);
            window.dispatchEvent(new Event('storage'));
        }
    };

    const clearExcelData = () => {
        setExcelData([]);
        setExcelFileName('');
        localStorage.removeItem('importedExcelData');
        localStorage.removeItem('importedExcelFileName');
    };



    return (
        <div className="p-6 md:p-12 text-gray-800">
            <div className="max-w-2xl mx-auto bg-white rounded-2xl shadow-xl overflow-hidden">
                <div className="bg-orange-500 p-6 text-white text-center">
                    <h1 className="text-3xl font-black">Admin Panel</h1>
                    <p className="text-sm opacity-90 mt-1">Add winning bids during the auction</p>
                </div>

                {/* Google Sheets Sync Section */}
                <div className="px-8 pt-6">
                    <div className="flex flex-col gap-3">
                        <label className="text-xs font-bold text-gray-500 uppercase">Google Sheet URL</label>
                        <div className="flex items-center gap-3">
                            <input
                                type="text"
                                value={sheetUrl}
                                onChange={(e) => setSheetUrl(e.target.value)}
                                className="flex-1 bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm font-medium focus:outline-none focus:border-green-500"
                                placeholder="https://docs.google.com/spreadsheets/d/..."
                            />
                            <button
                                type="button"
                                onClick={handleSheetSync}
                                disabled={syncing}
                                className={`flex items-center gap-2 ${syncing ? 'bg-green-400' : 'bg-green-500 hover:bg-green-600'} text-white font-bold text-sm px-6 py-3 rounded-xl transition shadow-lg shadow-green-200`}
                            >
                                <i className={`fa-solid fa-arrows-rotate ${syncing ? 'animate-spin' : ''}`}></i>
                                {syncing ? 'Syncing...' : 'Sync Sheet'}
                            </button>
                        </div>
                        {excelData.length > 0 ? (
                            <div className="flex items-center gap-2 mt-2">
                                <div className="flex items-center gap-2 bg-green-50 border border-green-200 text-green-700 px-4 py-2 rounded-xl text-xs font-bold inline-block">
                                    <i className="fa-solid fa-circle-check"></i>
                                    <span>Synced with Google Sheets ({excelData.length} players)</span>
                                </div>
                                <button
                                    type="button"
                                    onClick={clearExcelData}
                                    className="text-red-400 hover:text-red-600 text-xs font-bold transition ml-2"
                                >
                                    Clear Data
                                </button>
                            </div>
                        ) : (
                            <p className="text-[10px] text-gray-400 mt-1">Make sure the sheet is shared as <span className="font-bold">"Anyone with the link can view"</span>.</p>
                        )}

                        <div className="mt-4 border-t border-gray-100 pt-4">
                            <label className="text-xs font-bold text-gray-500 uppercase">Apps Script Web App URL (For Live Saving)</label>
                            <input
                                type="text"
                                value={appsScriptUrl}
                                onChange={(e) => {
                                    setAppsScriptUrl(e.target.value);
                                    localStorage.setItem('appsScriptUrl', e.target.value);
                                }}
                                className="w-full mt-2 bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm font-medium focus:outline-none focus:border-green-500"
                                placeholder="https://script.google.com/macros/s/.../exec"
                            />
                            <p className="text-[10px] text-gray-400 mt-1">Paste your Web App URL here to automatically write bids back to the spreadsheet.</p>
                        </div>
                    </div>
                </div>
                
                <form onSubmit={handleSubmit} className="p-8 flex flex-col gap-5">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Select Team</label>
                            <select id="team" value={formData.team} onChange={handleChange} className="w-full bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm font-medium focus:outline-none focus:border-orange-500" required>
                                {[1, 2, 3, 4, 5, 6, 7, 8].map(num => (
                                    <option key={num} value={`TEAM ${num}`}>TEAM {num}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Player Role</label>
                            <select id="role" value={formData.role} onChange={handleChange} className="w-full bg-gray-100 border border-gray-200 rounded-lg p-3 text-sm font-medium focus:outline-none" disabled>
                                <option value="Player">Player</option>
                            </select>
                        </div>
                    </div>

                    {/* Player Name with Autocomplete */}
                    <div className="relative" ref={suggestionsRef}>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Player Name</label>
                        <div className="relative">
                            <input
                                type="text"
                                id="playerName"
                                value={formData.playerName}
                                onChange={handleNameChange}
                                onFocus={() => {
                                    if (formData.playerName.length >= 2 && suggestions.length > 0) {
                                        setShowSuggestions(true);
                                    }
                                }}
                                className="w-full bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm font-medium focus:outline-none focus:border-orange-500"
                                placeholder={excelData.length > 0 ? "Start typing to search imported players..." : "e.g. John Doe"}
                                required
                                autoComplete="off"
                            />
                            {excelData.length > 0 && (
                                <div className="absolute right-3 top-1/2 -translate-y-1/2 text-orange-400">
                                    <i className="fa-solid fa-magnifying-glass text-sm"></i>
                                </div>
                            )}
                        </div>

                        {/* Autocomplete Dropdown */}
                        {showSuggestions && (
                            <div className="absolute z-50 left-0 right-0 mt-1 bg-white rounded-xl border border-gray-200 shadow-2xl shadow-gray-200/60 max-h-64 overflow-y-auto">
                                {suggestions.map((s, idx) => (
                                    <button
                                        key={idx}
                                        type="button"
                                        onClick={() => selectSuggestion(s)}
                                        className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-orange-50 transition border-b border-gray-50 last:border-b-0 group"
                                    >
                                        <div className="w-9 h-9 bg-orange-100 rounded-full flex items-center justify-center text-orange-600 font-black text-xs shrink-0 group-hover:bg-orange-200 transition">
                                            {s.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-bold text-gray-900 truncate">{s.name}</p>
                                            <p className="text-xs text-gray-400 truncate">
                                                {[s.gender, s.year && `Year ${s.year}`, s.section && `Sec ${s.section}`, s.sports].filter(Boolean).join(' • ')}
                                            </p>
                                        </div>
                                        <i className="fa-solid fa-arrow-turn-down text-gray-300 text-xs group-hover:text-orange-500 transition"></i>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
                        <div className="col-span-2 md:col-span-1">
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Gender</label>
                            <select id="gender" value={formData.gender} onChange={handleChange} className="w-full bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm font-medium focus:outline-none focus:border-orange-500" required>
                                <option value="M">M</option>
                                <option value="F">F</option>
                            </select>
                        </div>
                        <div className="col-span-2 md:col-span-1">
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Year</label>
                            <input type="text" id="year" value={formData.year} onChange={handleChange} className="w-full bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm font-medium focus:outline-none focus:border-orange-500" placeholder="e.g. 2nd" required />
                        </div>
                        <div className="col-span-2 md:col-span-2">
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Section</label>
                            <input type="text" id="section" value={formData.section} onChange={handleChange} className="w-full bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm font-medium focus:outline-none focus:border-orange-500" placeholder="e.g. A" required />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Sports Played</label>
                        <input type="text" id="sports" value={formData.sports} onChange={handleChange} className="w-full bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm font-medium focus:outline-none focus:border-orange-500" placeholder="e.g. Cricket, Football" required />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Bid Amount (₹)</label>
                            <input type="number" id="bidAmount" value={formData.bidAmount} onChange={handleChange} className="w-full bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm font-medium focus:outline-none focus:border-orange-500" placeholder="e.g. 1000" required />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Photo URL (Optional)</label>
                            <input type="text" id="photoUrl" value={formData.photoUrl} onChange={handleChange} className="w-full bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm font-medium focus:outline-none focus:border-orange-500" placeholder="https://..." />
                        </div>
                    </div>

                    {duplicateError && (
                        <div className="bg-red-50 border-l-4 border-red-500 text-red-700 p-4 mt-4 rounded shadow-sm">
                            <p className="font-bold text-sm">
                                <i className="fa-solid fa-triangle-exclamation mr-2"></i>
                                Error
                            </p>
                            <p className="text-sm mt-1">{duplicateError}</p>
                        </div>
                    )}

                    <button type="submit" className={`mt-4 ${editPlayerId ? 'bg-blue-500 hover:bg-blue-600' : 'bg-orange-500 hover:bg-orange-600'} text-white font-bold text-lg py-4 rounded-xl transition shadow-lg`}>
                        {editPlayerId ? "Update Player" : "Save Bid to Team"}
                    </button>
                    {editPlayerId && (
                        <button type="button" onClick={() => {
                            setEditPlayerId(null);
                            setFormData({ team: 'TEAM 1', role: 'Player', playerName: '', gender: 'M', year: '', section: '', sports: '', bidAmount: '', photoUrl: '' });
                        }} className="mt-2 text-gray-500 font-bold text-sm hover:text-gray-700 transition">Cancel Edit</button>
                    )}
                    {showSuccess && <p className="text-green-600 font-bold text-center text-sm mt-2">Player added successfully!</p>}
                </form>
            </div>



            {/* View List */}
            <div className="max-w-2xl mx-auto mt-8 bg-white p-6 rounded-2xl shadow-xl">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-lg font-bold">Recent Entries</h2>
                    <button onClick={clearData} className="text-xs bg-red-100 text-red-600 px-3 py-1 rounded-full font-bold hover:bg-red-200 transition">Clear All Data</button>
                </div>
                <div className="flex flex-col gap-2 text-sm max-h-[300px] overflow-y-auto">
                    {players.length === 0 ? (
                        <p className="text-gray-400 italic">No entries yet.</p>
                    ) : (
                        players.slice().reverse().map(p => (
                            <div key={p.id} className="flex justify-between items-center p-3 bg-gray-50 rounded border border-gray-100">
                                <div><span className="font-bold">{p.name}</span> <span className="text-xs text-gray-500">({p.role})</span></div>
                                <div className="text-right flex items-center justify-end gap-4">
                                    <div className="text-right">
                                        <div className="font-bold text-orange-600">₹{p.bidAmount}</div>
                                        <div className="text-xs font-bold text-gray-400 uppercase tracking-widest">{p.team}</div>
                                    </div>
                                    <div className="flex gap-2">
                                        <button onClick={() => handleEdit(p)} className="w-8 h-8 flex items-center justify-center bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition shadow-sm"><i className="fa-solid fa-pen"></i></button>
                                        <button onClick={() => handleDelete(p.id)} className="w-8 h-8 flex items-center justify-center bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition shadow-sm"><i className="fa-solid fa-trash"></i></button>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}

export default Admin;
