// Facade over the multi-provider LLM layer in `src/lib/llm/`.
//
// Historical: `chat()` hit Gemini directly with a same-infrastructure model
// fallback (flash → flash-lite). Both variants go down together during Google
// regional incidents, so this now delegates to `chatViaProviders()` which adds
// Anthropic's Claude as a true cross-provider fallback.
//
// Re-exports preserved for callers that previously imported from here:
//   - `chat()`               — now multi-provider
//   - `getGeminiClient()`    — still used by the streaming chat route for tool-use
//   - `withRetry()`          — used by the streaming chat route
export { chatViaProviders as chat, getGeminiClient } from './llm/providers';
export { withRetry } from './llm/utils';
