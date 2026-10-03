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

  useEffect(() => {
    setCandidateIndex(0);
  }, [photoUrl]);

  const initials = getPlayerInitials(name);
  const currentSrc = candidates[candidateIndex];

  const handleImgError = () => {
    if (candidateIndex < candidates.length - 1) {
      setCandidateIndex(prev => prev + 1);
    } else {
      setCandidateIndex(candidates.length);
    }
  };

  return (
    <div className={containerClassName}>
      {currentSrc && candidateIndex < candidates.length ? (
        <img
          src={currentSrc}
          alt={alt || name || 'Player avatar'}
          className={className}
          onError={handleImgError}
          referrerPolicy="no-referrer"
          loading="lazy"
        />
      ) : showInitialsOnFail ? (
        <span>{initials}</span>
      ) : null}
    </div>
  );
}
