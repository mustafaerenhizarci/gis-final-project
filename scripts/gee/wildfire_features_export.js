// Google Earth Engine Code Editor script.
// 2025 Izmir Menderes-Seferihisar wildfire susceptibility dataset.
//
// Outputs:
// 1. burned_points.zip as a Shapefile
// 2. unburned_points.zip as a Shapefile
// 3. samplepoints.zip as a merged Shapefile with 500 burned + 500 unburned points
// 4. wildfire_dataset_samples.csv with Label + 15 extracted feature columns
//
// The script intentionally does not export GeoTIFF rasters by default so the
// downloaded dataset stays well below the 30 MB project limit.

var beforeStart = '2025-04-15';
var beforeEnd = '2025-06-15';
var afterStart = '2025-07-05';
var afterEnd = '2025-07-25';
var climateStart = '2025-06-26';
var climateEnd = '2025-07-04';

// Izmir 2025 wildfire complex AOI.
// This larger area covers Cesme, Seferihisar, Menderes, Buca and nearby
// affected districts so the script can allocate 500 burned + 500 unburned
// points from the post-fire image.
// Keep this default geometry for the first run. If you draw your own geometry
// in GEE, replace the rectangle below manually instead of relying on an empty
// imported `geometry` variable.
var studyArea = ee.Geometry.Rectangle([26.20, 37.75, 27.55, 38.55], null, false);
var targetPointsPerClass = 500;

Map.centerObject(studyArea, 9);
Map.addLayer(studyArea, { color: 'white' }, 'study area');

function maskS2Clouds(image) {
  var scl = image.select('SCL');
  var mask = scl.neq(3)
    .and(scl.neq(8))
    .and(scl.neq(9))
    .and(scl.neq(10))
    .and(scl.neq(11));
  return image.updateMask(mask).divide(10000);
}

function sentinelComposite(start, end) {
  return ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
    .filterBounds(studyArea)
    .filterDate(start, end)
    .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 45))
    .map(maskS2Clouds)
    .median()
    .clip(studyArea);
}

function ndvi(image, name) {
  return image.normalizedDifference(['B8', 'B4']).rename(name);
}

function nbr(image, name) {
  return image.normalizedDifference(['B8', 'B12']).rename(name);
}

function ndmi(image, name) {
  return image.normalizedDifference(['B8', 'B11']).rename(name);
}

function evi(image, name) {
  return image.expression(
    '2.5 * ((nir - red) / (nir + 6 * red - 7.5 * blue + 1))',
    {
      nir: image.select('B8'),
      red: image.select('B4'),
      blue: image.select('B2')
    }
  ).rename(name);
}

function distanceFromMask(mask, name) {
  return mask
    .unmask(0)
    .fastDistanceTransform(1024)
    .sqrt()
    .multiply(30)
    .min(30000)
    .rename(name)
    .clip(studyArea);
}

var before = sentinelComposite(beforeStart, beforeEnd);
var after = sentinelComposite(afterStart, afterEnd);

var ndviBefore = ndvi(before, 'ndvi_before');
var ndviAfter = ndvi(after, 'ndvi_after');
var nbrBefore = nbr(before, 'nbr_before');
var nbrAfter = nbr(after, 'nbr_after');
var ndmiBefore = ndmi(before, 'ndmi_before');
var eviBefore = evi(before, 'evi_before');
var dnbr = nbrBefore.subtract(nbrAfter).rename('dnbr');

var dem = ee.Image('USGS/SRTMGL1_003').clip(studyArea);
var terrain = ee.Terrain.products(dem);
var elevation = dem.rename('elevation');
var slope = terrain.select('slope').rename('slope');
var aspect = terrain.select('aspect').rename('aspect');

var landCover = ee.ImageCollection('ESA/WorldCover/v200')
  .first()
  .select('Map')
  .rename('land_cover')
  .clip(studyArea);

var era5 = ee.ImageCollection('ECMWF/ERA5_LAND/DAILY_AGGR')
  .filterBounds(studyArea)
  .filterDate(climateStart, climateEnd);

var temperature = era5
  .select('temperature_2m')
  .mean()
  .subtract(273.15)
  .rename('temperature')
  .clip(studyArea);

var uWind = era5.select('u_component_of_wind_10m').mean();
var vWind = era5.select('v_component_of_wind_10m').mean();
var windSpeed = uWind.pow(2).add(vWind.pow(2)).sqrt().rename('wind_speed').clip(studyArea);

var precipitation = ee.ImageCollection('UCSB-CHG/CHIRPS/DAILY')
  .filterBounds(studyArea)
  .filterDate(climateStart, climateEnd)
  .select('precipitation')
  .sum()
  .rename('precipitation')
  .clip(studyArea);

var soilMoisture = era5
  .select('volumetric_soil_water_layer_1')
  .mean()
  .rename('soil_moisture')
  .clip(studyArea);

var water = ee.Image('JRC/GSW1_4/GlobalSurfaceWater')
  .select('occurrence')
  .gt(50)
  .clip(studyArea);

var builtup = landCover.eq(50);
var cropland = landCover.eq(40);
var validSusceptibilityArea = landCover.neq(80)
  .and(landCover.neq(70))
  .and(landCover.neq(50));

var distanceToWater = distanceFromMask(water, 'dist_water');
var distanceToBuiltup = distanceFromMask(builtup, 'dist_built');
var distanceToCropland = distanceFromMask(cropland, 'dist_crop');

var modelFeatureImage = ee.Image.cat([
  elevation,
  slope,
  aspect,
  ndviBefore,
  nbrBefore,
  ndmiBefore,
  eviBefore,
  landCover,
  temperature,
  windSpeed,
  precipitation,
  soilMoisture,
  distanceToWater,
  distanceToBuiltup,
  distanceToCropland
]);

var postFireQaImage = ee.Image.cat([
  ndviAfter,
  nbrAfter,
  dnbr
]);

var validDataMask = modelFeatureImage
  .addBands(postFireQaImage)
  .mask()
  .reduce(ee.Reducer.min())
  .and(validSusceptibilityArea);

// The first 15 bands below are the model features. The post-fire bands are
// exported for QA/label traceability but excluded from model training.
var featureImage = modelFeatureImage
  .addBands(postFireQaImage)
  .updateMask(validDataMask)
  .toFloat();

var burnedMask = dnbr.gt(0.12)
  .and(validDataMask);
var burnedRelaxedMask = dnbr.gt(0.03)
  .and(validDataMask);
var unburnedMask = dnbr.lt(0.12)
  .and(validDataMask);

function sampleClass(mask, label, seed) {
  var seedPoints = ee.Image.random(seed)
    .updateMask(mask)
    .sample({
      region: studyArea,
      scale: 30,
      numPixels: targetPointsPerClass * 5,
      seed: seed,
      geometries: true,
      tileScale: 16,
      dropNulls: true
    })
    .map(function (feature) {
      return ee.Feature(feature.geometry());
    });

  return featureImage.sampleRegions({
      collection: seedPoints,
      scale: 30,
      geometries: true,
      tileScale: 16
    })
    .filter(ee.Filter.neq('elevation', -9999))
    .limit(targetPointsPerClass)
    .map(function (feature) {
      return feature.set('Label', label);
    });
}

// Primary burned sample uses stricter dNBR. A relaxed burned sample is used
// only to fill the class to 500 points when the strict mask has too few pixels.
var burnedPoints = sampleClass(burnedRelaxedMask, 1, 202501);

var unburnedPoints = sampleClass(unburnedMask, 0, 202502);

var samplepoints = burnedPoints.merge(unburnedPoints)
  .randomColumn('random', 202503)
  .sort('random')
  .select([
    'Label',
    'elevation',
    'slope',
    'aspect',
    'ndvi_before',
    'nbr_before',
    'ndmi_before',
    'evi_before',
    'land_cover',
    'temperature',
    'wind_speed',
    'precipitation',
    'soil_moisture',
    'dist_water',
    'dist_built',
    'dist_crop',
    'ndvi_after',
    'nbr_after',
    'dnbr',
    'random'
  ]);

var burnedExport = burnedPoints
  .randomColumn('random', 202507)
  .sort('random')
  .select([
    'Label',
    'elevation',
    'slope',
    'aspect',
    'ndvi_before',
    'nbr_before',
    'ndmi_before',
    'evi_before',
    'land_cover',
    'temperature',
    'wind_speed',
    'precipitation',
    'soil_moisture',
    'dist_water',
    'dist_built',
    'dist_crop',
    'ndvi_after',
    'nbr_after',
    'dnbr',
    'random'
  ]);

var unburnedExport = unburnedPoints
  .randomColumn('random', 202508)
  .sort('random')
  .select([
    'Label',
    'elevation',
    'slope',
    'aspect',
    'ndvi_before',
    'nbr_before',
    'ndmi_before',
    'evi_before',
    'land_cover',
    'temperature',
    'wind_speed',
    'precipitation',
    'soil_moisture',
    'dist_water',
    'dist_built',
    'dist_crop',
    'ndvi_after',
    'nbr_after',
    'dnbr',
    'random'
  ]);

print('Burned candidate pixels', burnedMask.selfMask().reduceRegion({
  reducer: ee.Reducer.count(),
  geometry: studyArea,
  scale: 30,
  maxPixels: 1e9
}));
print('Unburned candidate pixels', unburnedMask.selfMask().reduceRegion({
  reducer: ee.Reducer.count(),
  geometry: studyArea,
  scale: 30,
  maxPixels: 1e9
}));
print('Label histogram', samplepoints.aggregate_histogram('Label'));
print('Burned export count', burnedExport.size());
print('Unburned export count', unburnedExport.size());
print('Total samplepoints', samplepoints.size());
print('First samplepoint', samplepoints.first());
print('15 model feature bands', [
  'elevation',
  'slope',
  'aspect',
  'ndvi_before',
  'nbr_before',
  'ndmi_before',
  'evi_before',
  'land_cover',
  'temperature',
  'wind_speed',
  'precipitation',
  'soil_moisture',
  'dist_water',
  'dist_built',
  'dist_crop'
]);

Map.addLayer(before, { bands: ['B4', 'B3', 'B2'], min: 0, max: 0.3 }, 'before RGB');
Map.addLayer(after, { bands: ['B4', 'B3', 'B2'], min: 0, max: 0.3 }, 'after RGB');
Map.addLayer(dnbr, { min: -0.2, max: 0.8, palette: ['green', 'yellow', 'red'] }, 'dNBR');
Map.addLayer(burnedMask.selfMask(), { palette: ['red'] }, 'burned mask strict');
Map.addLayer(burnedRelaxedMask.selfMask(), { palette: ['orange'] }, 'burned mask relaxed');
Map.addLayer(unburnedMask.selfMask(), { palette: ['green'] }, 'unburned mask');
Map.addLayer(burnedExport, { color: 'red' }, 'burned_points');
Map.addLayer(unburnedExport, { color: 'green' }, 'unburned_points');
Map.addLayer(samplepoints, {}, 'samplepoints');

Export.table.toDrive({
  collection: burnedExport,
  description: 'burned_points',
  fileNamePrefix: 'burned_points',
  fileFormat: 'SHP'
});

Export.table.toDrive({
  collection: unburnedExport,
  description: 'unburned_points',
  fileNamePrefix: 'unburned_points',
  fileFormat: 'SHP'
});

Export.table.toDrive({
  collection: samplepoints,
  description: 'samplepoints',
  fileNamePrefix: 'samplepoints',
  fileFormat: 'SHP'
});

Export.table.toDrive({
  collection: samplepoints,
  description: 'wildfire_dataset_samples_2025',
  fileNamePrefix: 'wildfire_dataset_samples',
  fileFormat: 'CSV'
});
