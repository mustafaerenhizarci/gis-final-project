from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.model_loader import RiskModel, risk_class
from app.schemas import (
    PredictRequest,
    PredictResponse,
)

app = FastAPI(title="Wildfire Susceptibility API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

risk_model = RiskModel()


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/predict", response_model=PredictResponse)
def predict(request: PredictRequest) -> PredictResponse:
    score = risk_model.predict_score(request.features, request.scenario)
    return PredictResponse(
        risk_score=score,
        risk_class=risk_class(score),
        model=risk_model.model_name,
    )


@app.post("/predict-batch")
async def predict_batch(request: Request) -> dict:
    payload = await request.json()
    request_items = payload.get("items", [])
    scores = risk_model.predict_scores_from_records(
        [item.get("features", {}) for item in request_items],
        payload.get("scenario", {}),
    )
    return {
        "items": [
            {
                "id": str(item.get("id", index)),
                "risk_score": score,
                "risk_class": risk_class(score),
            }
            for index, (item, score) in enumerate(zip(request_items, scores))
        ],
        "model": risk_model.model_name,
    }
