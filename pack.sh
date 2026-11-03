#!/bin/sh
# Pack public/app.js into gzipped parts public/app.N.bin + public/load.js, which joins and unpacks them in the browser.
# Small parts keep each deploy upload small and independently checksummed.
set -e
cd "$(dirname "$0")"
rm -f public/app.bin public/app.*.bin
gzip -9 -n -c public/app.js > /tmp/wb-app.gz
split -b 3000 -d -a 2 /tmp/wb-app.gz public/app.
for f in public/app.[0-9][0-9]; do mv "$f" "$f.bin"; done
N=$(ls public/app.*.bin | wc -l)
V=$(sha1sum /tmp/wb-app.gz | cut -c1-10)
cat > public/load.js <<JS
// Loads the gzipped app bundle (built by pack.sh from app.js, in $N parts) and runs it as a module.
(async () => {
  try {
    const parts = await Promise.all(Array.from({ length: $N }, (_, i) => fetch('/app.' + String(i).padStart(2, '0') + '.bin?v=$V').then(r => { if (!r.ok) throw new Error('bundle ' + r.status); return r.arrayBuffer(); })));
    const code = await new Response(new Blob(parts).stream().pipeThrough(new DecompressionStream('gzip'))).text();
    await import(URL.createObjectURL(new Blob([code], { type: 'text/javascript' })));
  } catch (e) { document.getElementById('app').innerHTML = '<div class="card empty">Wellby could not load. Please refresh, or update your browser.</div>'; console.error(e); }
})();
JS
