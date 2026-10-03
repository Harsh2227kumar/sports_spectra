import React from 'react';
import { Link } from 'react-router-dom';

function Landing() {
  return (
    <>
      {/* HERO SECTION */}
      <section className="relative h-screen min-h-[600px] w-full overflow-hidden bg-[#0a0a0a]">
        {/* High-res hockey image */}
        <img src="/homepage_bg.png"
             className="absolute inset-0 w-full h-full object-cover opacity-60" alt="Sports Background" />

        {/* Navbar */}
        <nav className="relative z-50 flex justify-between items-center px-4 sm:px-6 md:px-12 py-4 sm:py-6 md:py-8 text-white">
          <div className="text-xl sm:text-2xl md:text-3xl font-black tracking-tighter text-orange-500">SPORTS CLUB</div>
          <div className="hidden md:flex gap-8 uppercase text-xs tracking-widest font-bold">
            <a href="#about" className="hover:text-orange-400 transition">About</a>
            <a href="#auction" className="hover:text-orange-400 transition text-orange-500">Auction</a>
            <a href="#join" className="hover:text-orange-400 transition">Join</a>
          </div>
        </nav>

        {/* Hero Content */}
        <div className="relative z-20 flex flex-col justify-center min-h-[60vh] px-4 sm:px-6 md:px-12 py-6">
          <h1 className="hero-font text-5xl sm:text-7xl md:text-[8vw] leading-[0.88] text-white uppercase tracking-tight">
            Sports<br /><span className="text-orange-500">Spectra 4.0</span>
          </h1>
          <p className="max-w-md mt-4 sm:mt-6 text-white/90 text-sm md:text-base leading-relaxed">
            The biggest sports festival of the year! From cricket to badminton, football to volleyball – it’s your
            time to step into the arena and show your passion for sports.
          </p>
          <div className="mt-6 sm:mt-8 flex flex-col sm:flex-row gap-3 sm:gap-4 items-stretch sm:items-center">
            <Link to="/auction"
                  className="bg-orange-500 text-white px-6 sm:px-8 py-3.5 sm:py-4 rounded-full font-bold flex items-center justify-center gap-3 sm:gap-4 hover:scale-105 transition-transform w-full sm:w-max shadow-lg shadow-orange-500/30 text-sm sm:text-base">
              <span>Live Auction Dashboard</span>
              <span className="bg-black/20 text-white w-6 h-6 rounded-full flex items-center justify-center text-[10px]">
                <i className="fa-solid fa-arrow-right"></i>
              </span>
            </Link>
            <div className="flex items-center justify-center gap-2.5 text-white/90 text-xs sm:text-sm font-bold bg-white/10 px-5 sm:px-6 py-3 rounded-full backdrop-blur-sm w-full sm:w-max border border-white/20">
              <i className="fa-regular fa-calendar text-orange-500"></i> Oct 09-11, 2026
            </div>
          </div>

          <div className="flex md:hidden flex-wrap gap-2 mt-6">
            <span className="bg-white/10 border border-white/20 backdrop-blur-md text-white px-3 py-1 rounded-full text-[10px] uppercase tracking-wider">
              Oct 09-11, 2026
            </span>
            <span className="bg-white/10 border border-white/20 backdrop-blur-md text-white px-3 py-1 rounded-full text-[10px] uppercase tracking-wider">
              Venue: DSRW
            </span>
          </div>
        </div>

        {/* Desktop Tagging */}
        <div className="hidden md:flex absolute bottom-12 right-12 z-30 flex-wrap gap-2 max-w-md justify-end">
          <span className="bg-white/10 border border-white/20 backdrop-blur-md text-white px-4 py-1.5 rounded-full text-[9px] uppercase tracking-wider">
            09, 10 & 11 Oct 2026
          </span>
          <span className="bg-white/10 border border-white/20 backdrop-blur-md text-white px-4 py-1.5 rounded-full text-[9px] uppercase tracking-wider">
            Venue: DSRW
          </span>
        </div>

        {/* Big Background Text */}
        <div className="bg-text-spectra hero-font">SPECTRA</div>
      </section>

      {/* AUCTION SECTION */}
      <section id="auction"
               className="px-4 sm:px-6 md:px-12 py-10 sm:py-16 md:py-20 flex flex-col md:flex-row justify-between items-start md:items-center gap-6 sm:gap-10 bg-orange-500 text-white">
        <div className="flex items-center gap-3 text-lg md:text-xl font-bold self-start md:w-1/2">
          <span className="text-black text-2xl sm:text-3xl"><i className="fa-solid fa-gavel"></i></span>
          <p className="text-xl sm:text-2xl md:text-3xl font-black">IMPORTANT NOTICE<br />PLAYER AUCTION</p>
        </div>
        <div className="w-full md:w-1/2 text-xs sm:text-sm md:text-base bg-black/20 p-5 sm:p-6 rounded-2xl border border-white/20">
          <ul className="space-y-2.5 sm:space-y-3 font-medium">
            <li><i className="fa-solid fa-check text-green-300 mr-2"></i> Only players who submit the form will be in the auction.</li>
            <li><i className="fa-solid fa-triangle-exclamation text-yellow-300 mr-2"></i> Submitting the form does <strong>not guarantee</strong> selection.</li>
            <li><i className="fa-solid fa-ban text-red-300 mr-2"></i> If no team bids for a player, they will be declared <strong>UNSOLD</strong> and cannot participate.</li>
            <li><i className="fa-solid fa-scale-balanced text-blue-200 mr-2"></i> The sold/unsold decision during the auction will be final.</li>
          </ul>
        </div>
      </section>

      {/* INFO SECTION */}
      <section id="about" className="px-4 sm:px-6 md:px-12 py-12 sm:py-16 md:py-24 bg-gray-100">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">

          {/* Dashed Box */}
          <div className="md:col-span-4 bg-white p-6 sm:p-10 clip-left border-2 border-dashed border-gray-300 flex flex-col justify-center rounded-2xl sm:rounded-none">
            <h3 className="font-black text-lg sm:text-xl mb-3 sm:mb-4 text-[#0a0a0a]">WHO CAN JOIN?</h3>
            <p className="text-xs sm:text-sm font-medium leading-relaxed text-gray-600 mb-4">
              🔹 All students ready to compete with spirit and sportsmanship.<br /><br />
              🔹 No matter if you’re a beginner or a pro – everyone gets a chance to shine! ✨
            </p>
          </div>

          {/* Action Cards */}
          <div className="md:col-span-4 flex flex-col gap-4 sm:gap-6">
            <div className="bg-white border border-gray-200 rounded-2xl p-6 sm:p-8 flex-1 flex flex-col justify-center shadow-xs relative overflow-hidden">
              <div className="absolute -right-4 -bottom-4 text-gray-100 text-7xl sm:text-8xl opacity-50">
                <i className="fa-regular fa-calendar-check"></i>
              </div>
              <span className="text-xs sm:text-sm font-black text-gray-400 mb-1">DATES</span>
              <span className="text-lg sm:text-xl font-bold text-[#0a0a0a]">09, 10 & 11 Oct 2026</span>
            </div>
            <div className="bg-white border border-gray-200 rounded-2xl p-6 sm:p-8 flex-1 flex flex-col justify-center shadow-xs relative overflow-hidden">
              <div className="absolute -right-4 -bottom-4 text-gray-100 text-7xl sm:text-8xl opacity-50">
                <i className="fa-solid fa-location-dot"></i>
              </div>
              <span className="text-xs sm:text-sm font-black text-gray-400 mb-1">VENUE</span>
              <span className="text-lg sm:text-xl font-bold text-[#0a0a0a]">DSRW Arena</span>
            </div>
          </div>

          {/* Register Now Box */}
          <div className="md:col-span-4 bg-[#0A1128] text-white rounded-2xl p-6 sm:p-8 flex flex-col justify-between shadow-xl">
            <div>
              <h3 className="text-xl sm:text-2xl font-black mb-2 text-orange-500">LET'S MAKE HISTORY!</h3>
              <p className="text-xs sm:text-sm text-gray-300">Play hard, play fair, and make memories that last forever. Represent your team and your spirit.</p>
            </div>
            <a href="https://forms.gle/o3aTgoz7zNzx7mCQ8" target="_blank" rel="noreferrer"
               className="mt-6 sm:mt-8 bg-orange-500 text-white rounded-full p-3.5 sm:p-4 flex justify-between items-center hover:bg-orange-600 transition-all cursor-pointer font-bold w-full text-xs sm:text-sm">
              <span>PARTICIPATE NOW</span>
              <span className="bg-white text-orange-500 w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-xs sm:text-sm">
                <i className="fa-solid fa-chevron-right"></i>
              </span>
            </a>
          </div>
        </div>
      </section>
    </>
  );
}

export default Landing;
