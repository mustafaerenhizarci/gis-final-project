from pydantic import BaseModel, Field


class FeatureVector(BaseModel):
    elevation: float
    slope: float
    aspect: float
    ndvi_before: float
    nbr_before: float
    ndmi_before: float
    evi_before: float
    land_cover: float
    temperature: float
    wind_speed: float
    precipitation: float
    soil_moisture: float
    distance_to_water: float
    distance_to_builtup: float
    distance_to_cropland: float
    ndvi_after: float = Field(default=0)
    nbr_after: float = Field(default=0)
    dnbr: float = Field(default=0)


class ScenarioParams(BaseModel):
    temperature_delta: float = 0
    wind_speed_delta: float = 0
    precipitation_delta: float = 0
    soil_moisture_delta: float = 0


class PredictRequest(BaseModel):
    features: FeatureVector
    scenario: ScenarioParams = ScenarioParams()


class BatchFeature(BaseModel):
    id: str
    features: FeatureVector


class PredictBatchRequest(BaseModel):
    items: list[BatchFeature]
    scenario: ScenarioParams = ScenarioParams()


class PredictResponse(BaseModel):
    risk_score: float
    risk_class: str
    model: str


class BatchPredictItem(BaseModel):
    id: str
    risk_score: float
    risk_class: str


class PredictBatchResponse(BaseModel):
    items: list[BatchPredictItem]
    model: str
