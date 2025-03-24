export interface ExtensionConfig {
  apiKey: string;
  defaultModel: string;
  contextWindowSize: number;
}

export interface SecureStorage {
  apiKey?: string;
}