export type ChatRequest = { system: string; user: string; signal?: AbortSignal };

export type ChatClient = {
  id: string;
  model: string | null;
  available: () => boolean;
  complete: (request: ChatRequest) => Promise<string>;
};

export type Translation = { language: string; text: string; model: string };

export type Translator = {
  id: string;
  available: () => boolean;
  translate: (text: string, languages: string[], signal?: AbortSignal) => Promise<Translation[]>;
};

export class AiNotConfiguredError extends Error {
  code = "AI_NOT_CONFIGURED";
  constructor() {
    super("AI_NOT_CONFIGURED");
  }
}

export class AiProviderError extends Error {
  code = "AI_PROVIDER_ERROR";
  constructor() {
    super("AI_PROVIDER_ERROR");
  }
}

export function unavailableChat(): ChatClient {
  return {
    id: "unavailable",
    model: null,
    available: () => false,
    complete: async () => {
      throw new AiNotConfiguredError();
    },
  };
}

export function unavailableTranslator(): Translator {
  return {
    id: "unavailable",
    available: () => false,
    translate: async () => [],
  };
}

export function openAiCompatibleChat(options: {
  apiKey: string;
  baseUrl: string;
  model: string;
  fetchImpl?: typeof fetch;
}): ChatClient {
  const fetchImpl = options.fetchImpl ?? fetch;
  return {
    id: "openai-compatible",
    model: options.model,
    available: () => Boolean(options.apiKey && options.model),
    async complete(request) {
      if (!options.apiKey || !options.model) throw new AiNotConfiguredError();
      let response: Response;
      try {
        response = await fetchImpl(`${options.baseUrl.replace(/\/$/, "")}/chat/completions`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${options.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: options.model,
            temperature: 0,
            messages: [
              { role: "system", content: request.system },
              { role: "user", content: request.user },
            ],
          }),
          signal: request.signal,
        });
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") throw error;
        throw new AiProviderError();
      }
      if (!response.ok) throw new AiProviderError();
      const payload = (await response.json()) as { choices?: { message?: { content?: string } }[] };
      const content = payload.choices?.[0]?.message?.content;
      if (!content) throw new AiProviderError();
      return content;
    },
  };
}

export function openAiCompatibleTranslator(options: {
  apiKey: string;
  baseUrl: string;
  model: string;
  fetchImpl?: typeof fetch;
}): Translator {
  const chat = openAiCompatibleChat(options);
  return {
    id: "openai-compatible",
    available: () => chat.available(),
    async translate(text, languages, signal) {
      if (!chat.available()) return [];
      const raw = await chat.complete({
        system: "Translate the user text into each requested language. Return a JSON array of {language, text}. Do not add religious rulings.",
        user: JSON.stringify({ text, languages }),
        signal,
      });
      const parsed = JSON.parse(stripFence(raw)) as { language: string; text: string }[];
      if (!Array.isArray(parsed)) throw new AiProviderError();
      return parsed.map((item) => ({ ...item, model: options.model }));
    },
  };
}

export function stripFence(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1] : trimmed;
}
