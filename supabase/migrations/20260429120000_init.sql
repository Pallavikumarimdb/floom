-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Profiles table (extends auth.users)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Apps table
CREATE TABLE IF NOT EXISTS apps (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  owner_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  runtime TEXT NOT NULL CHECK (runtime IN ('python', 'typescript')),
  entrypoint TEXT NOT NULL,
  handler TEXT NOT NULL,
  public BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- App versions table
CREATE TABLE IF NOT EXISTS app_versions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  app_id UUID NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  version INT NOT NULL,
  bundle_path TEXT NOT NULL,
  input_schema JSONB NOT NULL DEFAULT '{}'::JSONB,
  output_schema JSONB NOT NULL DEFAULT '{}'::JSONB,
  dependencies JSONB NOT NULL DEFAULT '{}'::JSONB,
  secrets JSONB NOT NULL DEFAULT '[]'::JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(app_id, version)
);

-- Executions table
CREATE TABLE IF NOT EXISTS executions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  app_id UUID NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  version_id UUID NOT NULL REFERENCES app_versions(id) ON DELETE CASCADE,
  input JSONB NOT NULL DEFAULT '{}'::JSONB,
  output JSONB,
  error TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'success', 'error')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- App share links table
CREATE TABLE IF NOT EXISTS app_share_links (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  app_id UUID NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Private bucket for uploaded app bundles. API routes access it with service role.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'app-bundles',
  'app-bundles',
  FALSE,
  52428800,
  ARRAY['application/zip', 'application/octet-stream']
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE UNIQUE INDEX IF NOT EXISTS app_share_links_token_hash_key
  ON app_share_links (token_hash);

-- RLS Policies
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE apps ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_share_links ENABLE ROW LEVEL SECURITY;

-- Profiles: users can read/write their own
CREATE POLICY "Users can read own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

-- Apps: owners have full access, public apps readable by anyone
CREATE POLICY "Owners can manage apps"
  ON apps FOR ALL
  USING (auth.uid() = owner_id);

CREATE POLICY "Public apps are readable"
  ON apps FOR SELECT
  USING (public = TRUE);

-- App versions: readable by app owner or if app is public
CREATE POLICY "App versions readable by owner"
  ON app_versions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM apps WHERE apps.id = app_versions.app_id AND apps.owner_id = auth.uid()
    )
  );

CREATE POLICY "Public app versions readable"
  ON app_versions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM apps WHERE apps.id = app_versions.app_id AND apps.public = TRUE
    )
  );

-- Executions: readable by app owner
CREATE POLICY "Executions readable by owner"
  ON executions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM apps WHERE apps.id = executions.app_id AND apps.owner_id = auth.uid()
    )
  );

-- Share links: readable by app owner
CREATE POLICY "Share links readable by owner"
  ON app_share_links FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM apps WHERE apps.id = app_share_links.app_id AND apps.owner_id = auth.uid()
    )
  );

-- Function to auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for new user signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
