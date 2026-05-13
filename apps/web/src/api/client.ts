const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

type ScenarioPayload = {
  temperature_delta: number;
  wind_speed_delta: number;
  precipitation_delta: number;
};

type BatchItem = {
  id: string;
  features: Record<string, number>;
};

export async function getHealth(): Promise<{ status: string }> {
  const response = await fetch(`${API_BASE_URL}/health`);
  if (!response.ok) {
    throw new Error("API health check failed");
  }
  return response.json();
}

export async function predictBatch(
  items: BatchItem[],
  scenario: ScenarioPayload,
  options?: { signal?: AbortSignal }
) {
  const response = await fetch(`${API_BASE_URL}/predict-batch`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    signal: options?.signal,
    body: JSON.stringify({
      items,
      scenario
    })
  });

  if (!response.ok) {
    throw new Error("Batch prediction failed");
  }

  return response.json() as Promise<{
    items: Array<{ id: string; risk_score: number; risk_class: string }>;
    model: string;
  }>;
}
