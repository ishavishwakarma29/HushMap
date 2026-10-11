import * as ort from 'onnxruntime-web';

// Point the bundled runtime at the public WASM binary. Setting a path prefix makes
// Vite treat ORT's dynamic .mjs import as an import from /public, which it rejects.
ort.env.wasm.wasmPaths = { wasm: '/ort/ort-wasm-simd-threaded.jsep.wasm' };
ort.env.wasm.numThreads = 1;
const $ = (id) => document.getElementById(id);
const status = $('modelStatus');
let sessionPromise;
let latestScore = null;

const samples = [
  { name: 'Harrison Park', x: 330, y: 252, quiet: 91, birds: 76, traffic: 14, tag: 'Birdsong Â· leafy', time: 'Best around 7:00 AM', desc: 'Illustrative sample observation. Tree-lined park with low sample traffic and morning birdsong.' },
  { name: 'Bassett Creek Trail', x: 467, y: 363, quiet: 86, birds: 61, traffic: 18, tag: 'Water Â· birdsong', time: 'Best around 8:30 AM', desc: 'Illustrative sample observation. Water and birds are common classifications here.' },
  { name: 'Garden Square', x: 548, y: 70, quiet: 79, birds: 83, traffic: 22, tag: 'Birdsong Â· garden', time: 'Best around 7:15 AM', desc: 'Illustrative sample observation. High birdsong score with some street sound.' },
  { name: 'River Walk', x: 756, y: 428, quiet: 75, birds: 43, traffic: 32, tag: 'Water Â· open path', time: 'Best around 6:45 PM', desc: 'Illustrative sample observation beside the river.' },
  { name: 'Third Street', x: 727, y: 281, quiet: 54, birds: 18, traffic: 71, tag: 'City sounds Â· lively', time: 'Quieter around 11:00 AM', desc: 'Illustrative sample observation with more traffic.' },
  { name: 'Market Lane', x: 134, y: 256, quiet: 62, birds: 29, traffic: 55, tag: 'Mixed Â· neighborhood', time: 'Best around 10:00 AM', desc: 'Illustrative sample neighborhood soundscape.' },
];
let filterMode = 'quiet';
let zoom = 1;

function renderPins() {
  const group = $('pins');
  group.innerHTML = samples.map((s, i) => {
    const c = s.quiet > 75 ? '#557d55' : s.quiet > 60 ? '#b6a94c' : '#d78a52';
    return `<g class="pin" data-i="${i}" transform="translate(${s.x} ${s.y})"><circle r="15" fill="${c}" opacity=".18"/><circle r="8" fill="${c}" stroke="#fbfaf5" stroke-width="2.5"/><text x="0" y="-18" text-anchor="middle" class="map-label" style="font-size:9px;paint-order:stroke;stroke:#e7e9dc;stroke-width:3px">${s.name}</text></g>`;
  }).join('');
  group.querySelectorAll('.pin').forEach((p) => p.onclick = () => openSpot(+p.dataset.i));
}
function renderPlaces() {
  const sorted = [...samples].sort((a, b) => filterMode === 'birds' ? b.birds - a.birds : filterMode === 'lively' ? a.quiet - b.quiet : b.quiet - a.quiet).slice(0, 3);
  $('places').innerHTML = sorted.map((s, i) => `<div class="place" data-spot="${samples.indexOf(s)}"><span class="rank">0${i + 1}</span><div><div class="place-name">${s.name}</div><div class="place-sub">${s.tag} Â· sample</div></div><span class="score">${filterMode === 'birds' ? s.birds : s.quiet}<small>${filterMode === 'birds' ? 'BIRD' : 'QUIET'}</small></span></div>`).join('');
  document.querySelectorAll('.place').forEach((e) => e.onclick = () => openSpot(+e.dataset.spot));
  $('loopScore').textContent = sorted[0].quiet;
  $('loopLabel').textContent = `${sorted[0].name} Â· illustrative sample data`;
}
function openSpot(i) {
  const s = samples[i];
  $('modalName').textContent = s.name;
  $('modalTag').textContent = `${s.tag} Â· sample data`;
  $('modalInfo').textContent = `Quiet ${s.quiet}/100 Â· birdsong ${s.birds}/100 Â· traffic ${s.traffic}/100. ${s.time}. ${s.desc}`;
  $('modal').classList.add('open');
}
function toast(message) {
  const el = $('toast'); el.textContent = message; el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2800);
}
function searchWalk() {
  const q = $('query').value.toLowerCase();
  if (!q.trim()) { toast('Try â€œquiet walk with birdsâ€ or â€œnear waterâ€.'); return; }
  filterMode = q.includes('bird') ? 'birds' : q.includes('lively') || q.includes('city') ? 'lively' : 'quiet';
  renderPlaces();
  let pick = filterMode === 'birds' ? [...samples].sort((a,b) => b.birds-a.birds)[0] : filterMode === 'lively' ? [...samples].sort((a,b) => a.quiet-b.quiet)[0] : [...samples].sort((a,b) => b.quiet-a.quiet)[0];
  if (q.includes('water')) pick = samples.find(s => s.name === 'Bassett Creek Trail');
  $('mapSubtitle').textContent = `${pick.name} Â· illustrative ${filterMode}-first suggestion`;
  toast(`Sample suggestion: ${pick.name}.`);
}

async function getSession() {
  if (!sessionPromise) {
    status.textContent = 'Loading YAMNet from this projectâ€™s local model fileâ€¦';
    sessionPromise = ort.InferenceSession.create('/models/yamnet.onnx', { executionProviders: ['wasm'], graphOptimizationLevel: 'all' })
      .then((s) => { status.textContent = 'YAMNet ready Â· inference runs locally. Audio is not uploaded or retained.'; return s; })
      .catch((err) => { sessionPromise = null; status.textContent = `Could not load the local model: ${err.message}`; throw err; });
  }
  return sessionPromise;
}
async function getLabels() {
  const csv = await fetch('/models/yamnet_class_map.csv').then(r => { if (!r.ok) throw new Error('Could not load YAMNet labels'); return r.text(); });
  return csv.trim().split(/\r?\n/).slice(1).map(line => {
    const cols = line.match(/(?:"([^"]*(?:""[^"]*)*)"|([^,]*))(?:,|$)/g) || [];
    const vals = line.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map(v => v.replace(/^"|"$/g, '').replaceAll('""','"'));
    return { index: Number(vals[0]), label: (vals[2] || '').trim() };
  });
}
function resample(data, fromRate, toRate) {
  if (fromRate === toRate) return data;
  const ratio = fromRate / toRate; const length = Math.floor(data.length / ratio); const out = new Float32Array(length);
  for (let i = 0; i < length; i++) { const pos = i * ratio; const lo = Math.floor(pos); const hi = Math.min(lo + 1, data.length - 1); const f = pos - lo; out[i] = data[lo] * (1-f) + data[hi] * f; }
  return out;
}
function category(label) {
  const s = label.toLowerCase();
  if (/bird|crow|sparrow|owl|pigeon|duck|goose|chirp|caw/.test(s)) return 'Birds';
  if (/vehicle|car |car,|truck|bus |motorcycle|engine|traffic|road|train|aircraft|airplane|siren/.test(s)) return 'Traffic';
  if (/water|rain|stream|river|ocean|wave|waterfall|fountain|splash|surf/.test(s)) return 'Water';
  if (/speech|conversation|children|crowd|cheer|footstep|human|talk|babble/.test(s)) return 'People';
  return null;
}
async function classifyBuffer(audioBuffer) {
  const mono = new Float32Array(audioBuffer.length);
  for (let c = 0; c < audioBuffer.numberOfChannels; c++) { const channel = audioBuffer.getChannelData(c); for (let i = 0; i < channel.length; i++) mono[i] += channel[i] / audioBuffer.numberOfChannels; }
  const wave = resample(mono, audioBuffer.sampleRate, 16000);
  const model = await getSession(); const labels = await getLabels();
  const inputName = model.inputNames[0]; const outputName = model.outputNames[0];
  const output = await model.run({ [inputName]: new ort.Tensor('float32', wave, [wave.length]) });
  const scores = output[outputName].data; const frameCount = output[outputName].dims[0]; const classCount = 521;
  const embeddingOutput = output[model.outputNames[1]];
  if (!embeddingOutput || embeddingOutput.dims[1] !== 1024) throw new Error('YAMNet did not return the expected embedding.');
  const embedding = new Array(1024).fill(0);
  for (let frame = 0; frame < embeddingOutput.dims[0]; frame++) {
    for (let i = 0; i < 1024; i++) embedding[i] += embeddingOutput.data[frame * 1024 + i] / embeddingOutput.dims[0];
  }
  const top = labels.map(({index,label}) => {
    let score = 0;
    for (let f = 0; f < frameCount; f++) score += scores[f * classCount + index] || 0;
    return { label, score: score / Math.max(1, frameCount), group: category(label) };
  }).sort((a,b) => b.score-a.score);
  const groups = { Birds: 0, Traffic: 0, Water: 0, People: 0 };
  for (const x of top) if (x.group) groups[x.group] = Math.max(groups[x.group], x.score);
  return { groups, top: top.slice(0,5).map(({label,score})=>({label,score})), embedding, capturedAt: new Date().toISOString() };
}
async function decodeFile(file) {
  const context = new AudioContext();
  try { const bytes = await file.arrayBuffer(); return await context.decodeAudioData(bytes); }
  finally { await context.close(); }
}
function showScore(score) {
  latestScore = score; $('resultCard').hidden = false;
  $('resultTime').textContent = new Date(score.capturedAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
  const entries = Object.entries(score.groups).map(([k,v]) => `<span style="display:inline-block;margin:0 8px 4px 0"><b>${k}</b> ${(v*100).toFixed(1)}%</span>`).join('');
  const top = score.top.map(x => `${x.label} ${(x.score*100).toFixed(1)}%`).join(' Â· ');
  $('resultText').innerHTML = `${entries}<br><span style="color:var(--muted)">Top model labels: ${top}. These are model confidence scores, not calibrated sound density.</span>`;
}
async function classifyFile(file) {
  if (!file) return;
  try {
    status.textContent = 'Decoding audio locallyâ€¦';
    const buffer = await decodeFile(file);
    if (buffer.duration > 20) throw new Error('Choose an audio clip of 20 seconds or less.');
    const score = await classifyBuffer(buffer);
    showScore(score); status.textContent = 'Classification complete. The audio buffer was released; no audio was uploaded.';
  } catch (err) { status.textContent = `Classification failed: ${err.message}`; toast(err.message); }
  $('audioFile').value = '';
}
async function recordFourSeconds() {
  const button = $('listen'); button.disabled = true;
  let stream;
  try {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Microphone capture needs HTTPS or localhost in a supported browser.');
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream); const chunks = [];
    recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    const ended = new Promise((resolve, reject) => { recorder.onerror = () => reject(new Error('Microphone capture failed.')); recorder.onstop = resolve; });
    recorder.start(); button.textContent = 'Listeningâ€¦'; status.textContent = 'Capturing a four-second clip in memory for local classification. It will not be saved.';
    await new Promise(resolve => setTimeout(resolve, 4000)); recorder.stop(); await ended;
    stream.getTracks().forEach(t => t.stop()); stream = null;
    const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
    await classifyFile(new File([blob], 'hushmap-capture', { type: blob.type }));
  } catch (err) { status.textContent = err.message; toast(err.message); }
  finally { stream?.getTracks().forEach(t => t.stop()); button.disabled = false; button.textContent = 'Record 4s'; }
}
function getNotebook() { try { return JSON.parse(localStorage.getItem('hushmap.scores') || '[]'); } catch { return []; } }
function renderNotebook() {
  const items = getNotebook();
  $('notebook').innerHTML = items.length ? items.slice(0,5).map(x => `<div style="padding:7px 0;border-bottom:1px solid var(--line)"><b>${escapeHtml(x.place || 'Unlabelled listen')}</b> Â· ${new Date(x.capturedAt).toLocaleString()}<br>Birds ${(x.groups.Birds*100).toFixed(1)}% Â· Traffic ${(x.groups.Traffic*100).toFixed(1)}% Â· Water ${(x.groups.Water*100).toFixed(1)}% Â· People ${(x.groups.People*100).toFixed(1)}%</div>`).join('') : 'No saved listens yet. Scores are stored only in this browser.';
}
function escapeHtml(s) { return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
$('search').onclick = searchWalk;
$('query').addEventListener('keydown', e => { if (e.key === 'Enter') searchWalk(); });
document.querySelectorAll('.chip').forEach(c => c.onclick = () => { $('query').value = c.dataset.query; searchWalk(); });
$('close').onclick = () => $('modal').classList.remove('open');
$('modal').onclick = e => { if (e.target.id === 'modal') e.currentTarget.classList.remove('open'); };
$('route').onclick = () => { $('modal').classList.remove('open'); toast('Sample walk selected.'); };
$('listen').onclick = recordFourSeconds;
$('audioFile').onchange = e => classifyFile(e.target.files[0]);
$('saveScore').onclick = () => {
  if (!latestScore) return;
  const items = getNotebook(); items.unshift({ groups: latestScore.groups, top: latestScore.top, capturedAt: latestScore.capturedAt, place: $('placeName').value.trim().slice(0,80) });
  localStorage.setItem('hushmap.scores', JSON.stringify(items.slice(0,100))); renderNotebook(); $('resultCard').hidden = true; $('placeName').value = ''; toast('Scores saved in this browser only.');
};
let tigerConfigured = false;
async function checkTiger() {
  try {
    const response = await fetch('/api/health');
    const health = await response.json();
    tigerConfigured = health.configured === true;
    $('tigerStatus').textContent = tigerConfigured ? 'Tiger Data is configured. Sharing is opt-in for each listen.' : 'Tiger Data integration is ready; set DATABASE_URL to enable it.';
  } catch { $('tigerStatus').textContent = 'Tiger Data API is offline. Start the app with npm run dev.'; }
  updateTigerButtons();
}
function updateTigerButtons() {
  const okay = tigerConfigured && Boolean(latestScore) && $('tigerConsent').checked;
  $('shareTiger').disabled = !okay;
  $('findSimilar').disabled = !okay;
}
$('tigerConsent').onchange = updateTigerButtons;
$('shareTiger').onclick = async () => {
  if (!latestScore || !$('tigerConsent').checked) return;
  $('shareTiger').disabled = true;
  $('tigerStatus').textContent = 'Sending derived scores and embedding to Tiger Data…';
  try {
    const response = await fetch('/api/observations', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ consent:true, embedding:latestScore.embedding, scores:latestScore.groups, observedAt:latestScore.capturedAt, placeLabel:$('placeName').value.trim().slice(0,80) }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Tiger Data request failed.');
    $('tigerStatus').textContent = `Saved to Tiger Data (observation ${data.id}). Raw audio was not sent.`;
    toast('Scores and embedding saved to Tiger Data.');
  } catch (err) { $('tigerStatus').textContent = err.message; }
  finally { updateTigerButtons(); }
};
$('findSimilar').onclick = async () => {
  if (!latestScore || !$('tigerConsent').checked) return;
  $('findSimilar').disabled = true;
  $('tigerStatus').textContent = 'Searching similar sound embeddings…';
  try {
    const response = await fetch('/api/similar', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ consent:true, embedding:latestScore.embedding }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Similarity search failed.');
    const matches = data.matches || [];
    $('tigerStatus').textContent = matches.length ? `Nearest sounds: ${matches.map(m => `${m.place_label || 'Unlabelled'} (${(Number(m.similarity) * 100).toFixed(0)}% similar)`).join(' · ')}` : 'No observations to compare yet. Add a few listens first.';
  } catch (err) { $('tigerStatus').textContent = err.message; }
  finally { updateTigerButtons(); }
};
$('exportScores').onclick = () => {
  const data = JSON.stringify({ schema:'hushmap-local-scores-v1', exportedAt:new Date().toISOString(), observations:getNotebook() }, null, 2);
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([data],{type:'application/json'})); a.download='hushmap-scores.json'; a.click(); URL.revokeObjectURL(a.href);
};
$('zoomIn').onclick = () => { zoom=Math.min(1.3,zoom+.1); $('pins').setAttribute('transform',`translate(-${450*(zoom-1)} -${260*(zoom-1)}) scale(${zoom})`); };
$('zoomOut').onclick = () => { zoom=Math.max(.85,zoom-.1); $('pins').setAttribute('transform',`translate(-${450*(zoom-1)} -${260*(zoom-1)}) scale(${zoom})`); };
renderPins(); renderPlaces(); renderNotebook(); checkTiger();

