// Loads the gzipped app bundle (built by pack.sh from app.js, in 16 parts) and runs it as a module.
(async () => {
  try {
    const parts = await Promise.all(Array.from({ length: 16 }, (_, i) => fetch('/app.' + String(i).padStart(2, '0') + '.bin?v=d935427bde').then(r => { if (!r.ok) throw new Error('bundle ' + r.status); return r.arrayBuffer(); })));
    const code = await new Response(new Blob(parts).stream().pipeThrough(new DecompressionStream('gzip'))).text();
    await import(URL.createObjectURL(new Blob([code], { type: 'text/javascript' })));
  } catch (e) { document.getElementById('app').innerHTML = '<div class="card empty">Wellby could not load. Please refresh, or update your browser.</div>'; console.error(e); }
})();
