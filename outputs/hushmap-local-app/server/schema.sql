CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS hushmap_observations (
  id BIGSERIAL PRIMARY KEY,
  observed_at TIMESTAMPTZ NOT NULL,
  place_label TEXT,
  scores JSONB NOT NULL,
  embedding VECTOR(1024) NOT NULL,
  model_name TEXT NOT NULL DEFAULT 'YAMNet / AudioSet',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hushmap_observations_embedding_hnsw
  ON hushmap_observations USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS hushmap_observations_observed_at
  ON hushmap_observations (observed_at DESC);
