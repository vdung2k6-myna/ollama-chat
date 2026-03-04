/// <reference lib="dom" />
/// <reference lib="dom.iterable" />

// DOM types for frontend TypeScript
declare global {
  interface Window {
    ENV?: {
      BACKEND_URL: string;
    };
    marked: any;
  }
}

export {};