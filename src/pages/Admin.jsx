import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';

function Admin() {
    const [isAuthenticated, setIsAuthenticated] = useState(() => sessionStorage.getItem('adminAuth') === 'true');
    const [passwordInput, setPasswordInput] = useState('');
    const [loginError, setLoginError] = useState(false);

    const [players, setPlayers] = useState([]);
    const [showSuccess, setShowSuccess] = useState(false);

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

        return () => window.removeEventListener('storage', loadPlayers);
    }, []);
    const handleNameChange = (e) => {
        setDuplicateError(null);
        const value = e.target.value;
        setFormData(prev => ({ ...prev, playerName: value }));
    };

    const handleChange = (e) => {
        setDuplicateError(null);
        const { id, value } = e.target;
        setFormData(prev => ({ ...prev, [id]: value }));
    };

    const syncToSupabase = async (playerData, action) => {
        try {
            if (action === 'add') {
                await supabase.from('players').insert([{
                    team: playerData.team,
                    role: playerData.role,
                    name: playerData.name,
                    gender: playerData.gender,
                    year: playerData.year,
                    section: playerData.section,
                    sports: playerData.sports,
                    bid_amount: playerData.bidAmount,
                    photo_url: playerData.photoUrl
                }]);
            } else if (action === 'edit') {
                await supabase.from('players').update({
                    team: playerData.team,
                    role: playerData.role,
                    name: playerData.name,
                    gender: playerData.gender,
                    year: playerData.year,
                    section: playerData.section,
                    sports: playerData.sports,
                    bid_amount: playerData.bidAmount,
                    photo_url: playerData.photoUrl
                }).eq('name', playerData.name);
            } else if (action === 'delete') {
                await supabase.from('players').delete().eq('name', playerData.name);
            }
        } catch (err) {
            console.error("Supabase Sync Error:", err);
        }
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
                syncToSupabase(editedPlayer, 'edit');
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

            // Send to Supabase
            syncToSupabase(player, 'add');
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
                syncToSupabase(playerToDelete, 'delete');
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





    const handleLogin = (e) => {
        e.preventDefault();
        if (passwordInput === import.meta.env.VITE_ADMIN_PASSWORD) {
            setIsAuthenticated(true);
            sessionStorage.setItem('adminAuth', 'true');
            setLoginError(false);
        } else {
            setLoginError(true);
            setPasswordInput('');
        }
    };

    if (!isAuthenticated) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
                <div className="bg-white p-8 md:p-12 rounded-3xl shadow-xl max-w-md w-full text-center">
                    <div className="w-20 h-20 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-6 text-orange-500 text-3xl shadow-inner">
                        <i className="fa-solid fa-lock"></i>
                    </div>
                    <h1 className="text-3xl font-black text-gray-900 mb-2">Admin Access</h1>
                    <p className="text-gray-500 text-sm mb-8">Enter the password to access the auction dashboard.</p>
                    
                    <form onSubmit={handleLogin} className="flex flex-col gap-4">
                        <div>
                            <input 
                                type="password" 
                                value={passwordInput}
                                onChange={(e) => {
                                    setPasswordInput(e.target.value);
                                    setLoginError(false);
                                }}
                                placeholder="Enter Password" 
                                className={`w-full bg-gray-50 border ${loginError ? 'border-red-400 focus:border-red-500' : 'border-gray-200 focus:border-orange-500'} rounded-xl p-4 text-center font-medium focus:outline-none transition`}
                                required
                                autoFocus
                            />
                            {loginError && <p className="text-red-500 text-xs font-bold mt-2">Incorrect password. Please try again.</p>}
                        </div>
                        <button type="submit" className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold text-lg py-4 rounded-xl transition shadow-lg shadow-orange-200 mt-2">
                            Unlock Dashboard
                        </button>
                    </form>
                </div>
            </div>
        );
    }

    return (
        <div className="p-6 md:p-12 text-gray-800">
            <div className="max-w-2xl mx-auto bg-white rounded-2xl shadow-xl overflow-hidden">
                <div className="bg-orange-500 p-6 text-white text-center">
                    <h1 className="text-3xl font-black">Admin Panel</h1>
                    <p className="text-sm opacity-90 mt-1">Add winning bids during the auction</p>
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
                                className="w-full bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm font-medium focus:outline-none focus:border-orange-500"
                                placeholder="e.g. John Doe"
                                required
                                autoComplete="off"
                            />
                        </div>
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
