// The credits screen (menu.js) and its source of truth for what ships: keep in step with docs/CREDITS.md.
import sfx from '../public/assets/audio/sfx.json' with { type: 'json' };

const people = (list) => list.map(([what, who, licence, url]) => `<li>${what} — ${url ? `<a href="${url}" target="_blank" rel="noopener">${who}</a>` : who} (${licence})</li>`).join('');

export function creditsHtml() {
  const recordings = new Map();
  for (const s of Object.values(sfx)) {
    const k = `${s.credit.author}|${s.credit.license}`;
    if (!recordings.has(k)) recordings.set(k, { ...s.credit, titles: [] });
    recordings.get(k).titles.push(s.credit.title);
  }
  const rec = [...recordings.values()].sort((a, b) => a.author.localeCompare(b.author))
    .map(r => `<li>${r.author} — ${r.titles.slice(0, 3).map(t => `“${t}”`).join(', ')}${r.titles.length > 3 ? '…' : ''} (${r.license.replace(/\s*\(.*\)/, '')})</li>`).join('');
  return `
    <h3>A game in a flat at night</h3><p>Made with PlayCanvas (MIT). Story, design and code for this build by Claude, for its owner.</p>
    <h3>The apartment and its things</h3><ul>${people([
      ['“Modern Apartment”', 'Visthétique', 'CC BY 4.0', 'https://sketchfab.com/visthetique'],
      ['“Door with frame”', 'witnessk', 'CC BY 4.0', 'https://sketchfab.com/witnessk'],
      ['“Flash-Lite Flashlight”', 'AndrewHunt95', 'CC BY 4.0', 'https://sketchfab.com/AndrewHunt95'],
      ['“Glass Water Jug”', 'ShotaB', 'CC BY 4.0', 'https://sketchfab.com/ShotaB'],
      ['“Glass Collection”', 'RagingCow', 'CC BY 4.0', 'https://sketchfab.com/marcussamiran'],
    ])}</ul>
    <h3>People</h3><ul>${people([
      ['The intruder and the arm: avatars and animations from the Microsoft Rocketbox Avatar Library', 'Microsoft', 'MIT', 'https://github.com/microsoft/Microsoft-Rocketbox'],
    ])}</ul>
    <h3>Recordings</h3><p>Real recordings from Freesound and OpenGameArt contributors, through GitHub mirrors. Thank you:</p><ul class="cols">${rec}</ul>
    <h3>Type</h3><ul>${people([
      ['Cormorant Garamond', 'the Cormorant Project Authors', 'OFL 1.1', 'https://github.com/CatharsisFonts/Cormorant'],
      ['Caveat', 'the Caveat Project Authors', 'OFL 1.1', 'https://github.com/googlefonts/caveat'],
      ['Special Elite', 'Astigmatic', 'Apache 2.0', 'https://fonts.google.com/specimen/Special+Elite'],
    ])}</ul>
    <h3>Tools</h3><p>PlayCanvas, glTF Transform, meshoptimizer, Basis Universal, Draco, FBX2glTF, Vite, FFmpeg.</p>`;
}
