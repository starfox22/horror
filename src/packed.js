// The claude.ai artifact host serves no binary model files, so tools/make-artifact.mjs ships each .glb as base64 text
// (<file>.glb.b64.txt beside where it was). main.js marks a packed build (its apartment manifest is present) and loaders
// ask glbFile() for something PlayCanvas can load either way.
let packed = false;
export const setPacked = (value) => { packed = !!value; };

export async function glbFile(url) {
  const filename = url.split('/').pop();
  if (!packed) return { url: new URL(url, location.href).href, filename };
  const response = await fetch(new URL(`${url}.b64.txt`, location.href));
  if (!response.ok) throw new Error(`${filename}: HTTP ${response.status}`);
  const text = (await response.text()).trim();
  const bytes = Uint8Array.fromBase64 ? Uint8Array.fromBase64(text) : Uint8Array.from(atob(text), c => c.charCodeAt(0));
  return { url: URL.createObjectURL(new Blob([bytes], { type: 'model/gltf-binary' })), filename };
}
