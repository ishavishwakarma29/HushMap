# DEV submission draft

**Title:** Hushmap: an open soundscape atlas that keeps audio on your device

**Tags:** `devchallenge`, `hf26challenge`, `hacktoberfest`, `opensource`

*This is a draft for the [Hacktoberfest Open-Source AI Challenge Week 1: Touch Grass](https://dev.to/challenges/hacktoberfest-week1-2026-10-05). The deadline is October 11, 2026 at 11:59 PM PDT (October 12 at 12:29 PM IST). The submission window is still open until 11:59 PM PDT on October 11.*

## What I Built

Most city maps tell us what a place looks like. Hushmap asks what it sounds like.

Hushmap is a local-first soundscape atlas prototype. It can classify a short microphone capture or an audio file with YAMNet, an open audio event model, in the browser. It reduces model output to broad Birds, Traffic, Water, and People scores. A private notebook stores those scores in this browser, and the user can export them as JSON.

The interactive map currently uses clearly labeled illustrative sample data. It shows the kind of question the product is meant to answer: “Where could I take a quieter 20-minute walk?” or “Which nearby park might be good for birdsong in the morning?” The sample pins are not real measurements or directions.

## Demo

Run the app locally using the instructions in the [README](../README.md). The map and filters work with sample data. To try real inference, record four seconds or choose an audio file of up to 20 seconds. The included 16 MB YAMNet model runs on-device. Microphone access requires localhost or HTTPS.

Set `DATABASE_URL` to a Tiger Cloud Postgres service with pgvector available to enable the optional similarity feature. Sharing a score and its YAMNet embedding requires a separate consent checkbox. Raw audio is never sent.

## Code

The project entry point is [`index.html`](../index.html); app behavior is in [`src/main.js`](../src/main.js). The optional Node/Postgres API is in [`server/index.js`](../server/index.js), with its pgvector schema in [`server/schema.sql`](../server/schema.sql). YAMNet weights and labels are included under [`public/models`](../public/models). ONNX Runtime Web runs the model in the browser.

## How I Built It

I started with a product question: could a map help someone choose a walk by how it sounds, rather than how it looks? I wired Google's open YAMNet model to an in-browser ONNX runtime. The model takes a mono waveform at 16 kHz and produces AudioSet event scores and 1,024-dimensional embeddings. Hushmap groups some labels into four broad categories for a simple display.

A short recording is held in browser memory for inference and then discarded. No audio is sent to a server. If the user chooses “Save on device,” category scores, time, and the optional place label go into that browser's local storage. Export is a separate, explicit action.

For the optional Tiger Data integration, the browser asks for a second, explicit opt-in before sending category scores and an averaged YAMNet embedding to the app API. The API stores the derived vector in a `vector(1024)` column and uses pgvector cosine distance for similar-sound search. It never receives the recording. The API creates its table and HNSW index on the first opted-in request. I have implemented this integration path, but this workspace has no Tiger Cloud credentials, so it still needs a live connection and demo before I can claim the partner category.

The current map and route recommendations remain sample data. The next step is to run real consented walks and validate label grouping and scores before treating them as environmental observations. YAMNet confidence is not the same thing as measured sound density.

## Why Does Open Innovation Matter?

A neighborhood recording can contain a private conversation, a child’s voice, or a recognizable routine. Sending raw audio to a cloud classifier would make that recording leave the phone just to produce a few sound labels. Running an open model on-device makes a more privacy-preserving design possible: classify where the audio is captured, keep the recording local, and let a person decide whether to share derived scores and an embedding.

Open model weights and labels also let builders inspect the model’s vocabulary, change the mapping from labels to atlas categories, and test alternatives without being locked into a closed classification endpoint. This outdoor use case should still work when there is no signal after the model and app are available locally.

Open does not mean automatically private or accurate. Hushmap still needs real-world validation, clear consent, and careful location handling before it can become a community atlas. It does not collect precise location.

## My Agent Session

Optional: add a DevRelay session link or embed if you save one.

## Prize Categories

**Potential entry: Best Use of Tiger Data.** The project includes an opt-in pgvector integration for YAMNet embeddings, but I will only claim this category after connecting a Tiger Cloud service and recording a successful contribution and similarity search.

A Render Blueprint is included, but the app has not been deployed. Gemma could later improve flexible natural-language walk requests, and TabPFN could predict quieter hours after enough real observations exist. Neither is in this prototype: the current map is illustrative and a hand-written query parser is easier to audit. I would not add either model just to tick a partner box.

---

### Before publishing

- Set `DATABASE_URL` for a Tiger Cloud service, make one opted-in contribution, and run similarity search before claiming the Tiger Data category.
- Capture a screenshot or short demo video after trying local inference.
- Add a public repository URL and hosted demo if available. The Render Blueprint is at `render.yaml`; deployment and public safety review still need to be completed.
- Include a real outdoor field-test account only after actually testing it.
- Keep the sample-data notice visible; do not describe the sample map as collected community data.
- Recheck the PDT cutoff and challenge rules before publishing.

