// The messages the UI and the main thread send each other.
import type { Locators } from './types';

// Requests the UI makes and waits on; the main thread answers each with a `response`.
export interface Requests {
  locate: { payload: { ids: string[] }; result: Locators };
  resolve: { payload: { locators: Locators }; result: Record<string, string | null> };
}

export type RequestMessage = {
  [K in keyof Requests]: { type: K; requestId: number } & Requests[K]['payload'];
}[keyof Requests];

export type UiToMain =
  | RequestMessage
  | { type: 'save-token'; host: string; token: string }
  | { type: 'save-welcome'; hide: boolean }
  // A measured height fits the window to the content; null restores the default.
  | { type: 'resize'; height: number | null };

export type MainToUi =
  | { type: 'init'; fileName: string; tokens: Record<string, string>; welcomeHidden: boolean }
  | { type: 'response'; requestId: number; result: unknown; error: string | null };
