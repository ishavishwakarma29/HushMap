# Hushmap

**A soundscape atlas for your city.** Hushmap lets you pause on a walk, listen to the place around you, and classify a short sound clip right in your browser. Recordings stay on your device; you decide whether to save or export the resulting scores.

Built for the [Hacktoberfest Open-Source AI Challenge Week 1: Touch Grass](https://dev.to/challenges/hacktoberfest-week1-2026-10-05).

## Demo

[Watch the Hushmap demo on YouTube](https://youtu.be/EhRVPnIre8A)

The map presents an illustrative neighborhood soundscape. The demo also shows YAMNet classifying audio locally in the browser.

## What Hushmap does

- Explore an interactive neighborhood soundscape map and try quiet, birdsong, water, and city-sound searches.
- Record a four-second clip or select an audio file up to 20 seconds for on-device classification.
- See broad Birds, Traffic, Water, and People scores derived from YAMNet’s AudioSet labels.
- Save scores to a private browser notebook or export them as JSON.
- Optionally share derived scores and an audio embedding with a configured Tiger Data database for similarity search. Sharing requires an explicit consent checkbox; raw audio is never sent.

The map pins and sample scores are illustrative, so the experience can be explored without mistaking example data for collected measurements.

## Run locally

Requirements: Node.js 18 or newer.

```sh
npm install
npm run dev
```

Open the Vite **Local** URL printed in the terminal, usually [http://127.0.0.1:5173](http://127.0.0.1:5173). Keep the terminal running. Microphone access works on localhost or HTTPS. On first classification, Hushmap loads the included YAMNet model and runs inference in the browser. Audio is decoded in memory and discarded after scoring.

## How it works

YAMNet converts a short mono audio sample into AudioSet sound-class scores and 1,024-dimensional embeddings. Hushmap groups selected labels into four broad categories. ONNX Runtime Web runs the model on-device; the application server does not receive recordings. Scores remain in browser storage unless you explicitly export them or opt in to the optional Tiger Data feature.

## Optional Tiger Data + pgvector

The Node API can store consented YAMNet embeddings in a `vector(1024)` column and search for similar sounds with pgvector cosine distance. It stores category scores, capture time, and an optional place label; it does not store raw audio or precise coordinates.

1. Create a Tiger Cloud Postgres service with pgvector available. See Tiger Data’s [extension guide](https://docs.tigerdata.com/use-timescale/latest/extensions).
2. Copy `.env.example` to `.env` and set `DATABASE_URL` to your service connection string. Keep `.env` private.
3. Run `npm run dev`. On the first opted-in request, the API creates the observation table and HNSW index from `server/schema.sql`.
4. After classifying a sound, select the consent checkbox before using the Tiger Data contribution or similarity-search buttons.

The optional API is an unauthenticated development service. Configure authentication, abuse controls, data retention, and location policies before exposing it publicly.

## Model and runtime

- [YAMNet ONNX export](https://huggingface.co/audiomagic/yamnet-onnx), Apache-2.0; upstream Google's YAMNet. Attribution and license are in `public/models/`.
- [ONNX Runtime Web](https://github.com/microsoft/onnxruntime), for browser-based inference.
- Tiger Data uses standard PostgreSQL with pgvector through the Node `pg` client.

Model confidence scores are not calibrated measures of sound density or environmental quality. Hushmap is for exploration and listening, not safety or accessibility decisions.

## Hacktoberfest Week 1 Prize Categories

- **Overall challenge prize:** Hushmap is built around open YAMNet and local browser inference, and invites people to listen to the outdoors. Partner technology is optional for the overall prize. See the [challenge criteria](https://dev.to/challenges/hacktoberfest-week1-2026-10-05).
- **Best Use of Tiger Data:** Hushmap includes an opt-in pgvector integration for storing YAMNet embeddings and finding similar sound observations. To demonstrate this partner integration, configure Tiger Cloud using the instructions above and make a contribution and similarity search.
