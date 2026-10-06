import React, { useState, useEffect } from 'react';
import { getPhotoUrlCandidates, getPlayerInitials } from '../utils/photoUtils';

export default function PlayerAvatar({ 
  photoUrl, 
  name = '', 
  className = "w-full h-full object-cover", 
  containerClassName = "w-12 h-12 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center font-black text-sm shrink-0 overflow-hidden shadow-xs relative",
  alt = "",
  showInitialsOnFail = true
}) {
  const candidates = getPhotoUrlCandidates(photoUrl);
  const [candidateIndex, setCandidateIndex] = useState(0);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    setCandidateIndex(0);
    setIsLoaded(false);
  }, [photoUrl]);

  const initials = getPlayerInitials(name);
  const currentSrc = candidates[candidateIndex];

  const handleImgError = () => {
    setIsLoaded(false);
    if (candidateIndex < candidates.length - 1) {
      setCandidateIndex(prev => prev + 1);
    } else {
      setCandidateIndex(candidates.length);
    }
  };

  const handleImgLoad = () => {
    setIsLoaded(true);
  };

  return (
    <div className={`${containerClassName} relative`}>
      {currentSrc && candidateIndex < candidates.length ? (
        <>
          {!isLoaded && (
            <div className="absolute inset-0 bg-gray-200 animate-pulse flex items-center justify-center z-0">
                <i className="fa-solid fa-image text-gray-300/50 text-xs sm:text-sm"></i>
            </div>
          )}
          <img
            src={currentSrc}
            alt={alt || name || 'Player avatar'}
            className={`${className} ${isLoaded ? 'opacity-100' : 'opacity-0'} transition-opacity duration-300 relative z-10`}
            onError={handleImgError}
            onLoad={handleImgLoad}
            referrerPolicy="no-referrer"
            loading="lazy"
          />
        </>
      ) : showInitialsOnFail ? (
        <span className="relative z-10">{initials}</span>
      ) : null}
    </div>
  );
}
