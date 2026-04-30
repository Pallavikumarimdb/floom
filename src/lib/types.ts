export interface AppRecord {
  id: string;
  slug: string;
  name: string;
  owner_id: string;
  runtime: "python" | "typescript";
  entrypoint: string;
  handler: string;
  public: boolean;
  created_at: string;
  updated_at: string;
}

export interface AppVersion {
  id: string;
  app_id: string;
  version: number;
  bundle_path: string;
  input_schema: object;
  output_schema: object;
  dependencies: object;
  secrets: string[];
  created_at: string;
}

export interface Execution {
  id: string;
  app_id: string;
  version_id: string;
  input: object;
  output: object | null;
  error: string | null;
  status: "pending" | "running" | "success" | "error";
  created_at: string;
  completed_at: string | null;
}

export interface AppShareLink {
  id: string;
  app_id: string;
  token_hash: string;
  expires_at: string | null;
  created_at: string;
}
