function requireEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }

  return value;
}

export async function complete(userMessage: string): Promise<string> {
  const baseUrl = requireEnv("OLLAMA_BASE_URL");
  const model = requireEnv("OLLAMA_MODEL");

  const response = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content: "Reply with one JSON object and no markdown.",
        },
        { role: "user", content: userMessage },
      ],
      temperature: 0,
      stream: false,
      format: "json",
    }),
  });

  if (!response.ok) {
    const detail = await response.text();

    throw new Error(
      `Ollama request failed (${response.status}): ${detail}`,
    );
  }

  const data = (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: string | null;
      };
    }>;
  };

  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error("Ollama response did not include assistant text");
  }

  return content;
}
