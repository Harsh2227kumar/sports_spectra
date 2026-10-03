/**
 * Utility to format and normalize player photo URLs.
 * Converts Google Drive view/open links into direct image URLs and candidate fallback lists.
 */

export function getGoogleDriveFileId(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  const trimmed = rawUrl.trim();
  if (trimmed.includes('drive.google.com') || trimmed.includes('docs.google.com') || trimmed.includes('googleusercontent.com')) {
    const matchPath = trimmed.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    const matchQuery = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    const matchLh3 = trimmed.match(/googleusercontent\.com\/d\/([a-zA-Z0-9_-]+)/);
    if (matchPath && matchPath[1]) return matchPath[1];
    if (matchQuery && matchQuery[1]) return matchQuery[1];
    if (matchLh3 && matchLh3[1]) return matchLh3[1];
  }
  return null;
}

export function formatPhotoUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  const trimmed = rawUrl.trim();
  if (!trimmed || trimmed === 'null' || trimmed === 'undefined') return '';

  const fileId = getGoogleDriveFileId(trimmed);
  if (fileId) {
    return `https://drive.google.com/uc?export=view&id=${fileId}`;
  }

  if (trimmed.includes('dropbox.com')) {
    return trimmed.replace('dl=0', 'raw=1');
  }

  return trimmed;
}

export function getPhotoUrlCandidates(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return [];
  const trimmed = rawUrl.trim();
  if (!trimmed || trimmed === 'null' || trimmed === 'undefined') return [];

  const fileId = getGoogleDriveFileId(trimmed);
  if (fileId) {
    return [
      `https://drive.google.com/uc?export=view&id=${fileId}`,
      `https://lh3.googleusercontent.com/d/${fileId}`,
      `https://drive.google.com/thumbnail?id=${fileId}&sz=w800`
    ];
  }

  if (trimmed.includes('dropbox.com')) {
    return [
      trimmed.replace('dl=0', 'raw=1'),
      trimmed
    ];
  }

  return [trimmed];
}

/**
 * Extract clean display initials from a full name (e.g. "Ankit Tiwari" -> "AT", "Rahul" -> "R")
 */
export function getPlayerInitials(name) {
  if (!name || typeof name !== 'string') return 'P';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'P';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}
