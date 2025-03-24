/**
 * Simplified Axios type definitions
 */

export interface AxiosRequestConfig {
  baseURL?: string;
  headers?: Record<string, string>;
  timeout?: number;
  responseType?: string;
}

export interface AxiosResponse<T = any> {
  data: T;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  config: AxiosRequestConfig;
}

export interface AxiosInstance {
  defaults: AxiosRequestConfig;
  interceptors: {
    request: {
      use: (onFulfilled: (config: AxiosRequestConfig) => Promise<AxiosRequestConfig> | AxiosRequestConfig) => void;
    };
    response: {
      use: (onFulfilled: (response: AxiosResponse) => any) => void;
    };
  };
  get<T = any>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>>;
  post<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<AxiosResponse<T>>;
}