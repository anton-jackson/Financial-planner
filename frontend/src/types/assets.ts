export interface Asset {
  name: string;
  type: string;
  balance: number;
  return_profile: string;
  properties: Record<string, unknown>;
}

export interface AssetsFile {
  schema_version: number;
  assets: Asset[];
}
