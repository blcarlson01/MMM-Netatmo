const NetatmoFormatter = require("../formatter.js");

// Mirrors the enum in MMM-Netatmo.js; formatter.js takes it as a parameter
// rather than owning it, so tests pass in the same real field names it does.
const NetatmoDataType = {
	BATTERY: "battery_percent",
	CO2: "CO2",
	FIRMWARE: "firmware",
	GUST_STRENGTH: "GustStrength",
	GUST_ANGLE: "GustAngle",
	HUMIDITY: "Humidity",
	LAST_MESSAGE: "last_message",
	LAST_SEEN: "last_seen",
	NOISE: "Noise",
	PRESSURE: "Pressure",
	PRESSURE_TREND: "pressure_trend",
	PRESSURE_ABSOLUTE: "AbsolutePressure",
	RAIN: "Rain",
	RADIO: "rf_status",
	SUM_RAIN_1: "sum_rain_1",
	SUM_RAIN_24: "sum_rain_24",
	TEMPERATURE: "Temperature",
	TEMP_MIN: "min_temp",
	TEMP_MAX: "max_temp",
	TEMP_TREND: "temp_trend",
	WIFI: "wifi_status",
	WIND: "WindStrength",
	WIND_ANGLE: "WindAngle",
	WIND_ANGLE_MAX: "max_wind_angle",
	WIND_STRENGTH: "WindStrength",
	WIND_STRENGTH_MAX: "max_wind_str",
	HEALTH_IDX: "health_idx"
};

function metric() {
	return NetatmoFormatter.create(NetatmoDataType, { naValue: "NA", units: "metric", windUnit: "kmh" });
}

function imperial(windUnit) {
	return NetatmoFormatter.create(NetatmoDataType, { naValue: "NA", units: "imperial", windUnit: windUnit || "kmh" });
}

describe("value()", () => {
	test("passes through the configured NA value untouched", () => {
		expect(metric().value(NetatmoDataType.TEMPERATURE, "NA")).toBe("NA");
	});

	test("passes undefined through untouched, but still formats a real zero reading", () => {
		expect(metric().value(NetatmoDataType.CO2, undefined)).toBe(undefined);
		expect(metric().value(NetatmoDataType.CO2, 0)).toBe("0");
	});

	test.each([
		[NetatmoDataType.CO2, 612.4, "612"],
		[NetatmoDataType.NOISE, 38.6, "39"],
		[NetatmoDataType.HUMIDITY, 45.2, "45"],
		[NetatmoDataType.BATTERY, 82.0, "82"],
		[NetatmoDataType.RADIO, 62.0, "62"],
		[NetatmoDataType.WIFI, 56.0, "56"],
		[NetatmoDataType.PRESSURE, 1013.6, "1014"],
		[NetatmoDataType.GUST_ANGLE, 180.4, "180"],
		[NetatmoDataType.WIND_ANGLE, 90.6, "91"],
		[NetatmoDataType.WIND_ANGLE_MAX, 270.4, "270"]
	])("formats %s as %s", (dataType, input, expected) => {
		expect(metric().value(dataType, input)).toBe(expected);
	});

	test("rounds rain to 1 decimal in metric", () => {
		expect(metric().value(NetatmoDataType.RAIN, 3.14159)).toBe("3.1");
	});

	test("converts rain to inches at 3 decimals in imperial", () => {
		expect(imperial().value(NetatmoDataType.RAIN, 25.4)).toBe((1).toFixed(3));
	});

	test("keeps temperature in Celsius at 1 decimal for metric", () => {
		expect(metric().value(NetatmoDataType.TEMPERATURE, 21.44)).toBe("21.4");
	});

	test("converts temperature to Fahrenheit for imperial", () => {
		expect(imperial().value(NetatmoDataType.TEMPERATURE, 0)).toBe("32.0");
		expect(imperial().value(NetatmoDataType.TEMP_MIN, 100)).toBe("212.0");
	});

	test.each([
		["kmh", 36, "36"],
		["mph", 36, "22"],
		["ms", 36, "10.0"],
		["kt", 36, "19.4"],
		["bft", 36, "5"]
	])("formats wind strength for windUnit=%s", (windUnit, kmh, expected) => {
		expect(NetatmoFormatter.create(NetatmoDataType, { units: "metric", windUnit }).value(NetatmoDataType.WIND_STRENGTH, kmh)).toBe(expected);
	});

	test.each([
		[0, "Healthy"],
		[1, "Fine"],
		[2, "Fair"],
		[3, "Poor"],
		[4, "Unhealthy"]
	])("maps health_idx %d to %s", (idx, expected) => {
		expect(metric().value(NetatmoDataType.HEALTH_IDX, idx)).toBe(expected);
	});

	test("returns the raw value for an out-of-range health_idx instead of misreporting it as a percentage", () => {
		expect(metric().value(NetatmoDataType.HEALTH_IDX, 5)).toBe(5);
	});

	test("returns unmodified value for unknown data types", () => {
		expect(metric().value("SomeUnknownType", 42)).toBe(42);
	});
});

describe("unit()", () => {
	test.each([
		[NetatmoDataType.CO2, "PPM"],
		[NetatmoDataType.NOISE, "DB"],
		[NetatmoDataType.HUMIDITY, "%"],
		[NetatmoDataType.BATTERY, "%"],
		[NetatmoDataType.RADIO, "%"],
		[NetatmoDataType.WIFI, "DBM"],
		[NetatmoDataType.SUM_RAIN_1, "1H"],
		[NetatmoDataType.SUM_RAIN_24, "24H"],
		[NetatmoDataType.PRESSURE, "MBAR"],
		[NetatmoDataType.TEMPERATURE, "°"],
		["SomeUnknownType", ""]
	])("returns %s unit for %s", (dataType, expected) => {
		expect(metric().unit(dataType)).toBe(expected);
	});

	test("rain unit is MM in metric and INCH in imperial", () => {
		expect(metric().unit(NetatmoDataType.RAIN)).toBe("MM");
		expect(imperial().unit(NetatmoDataType.RAIN)).toBe("INCH");
	});

	test("wind strength unit reflects the configured windUnit", () => {
		expect(NetatmoFormatter.create(NetatmoDataType, { windUnit: "kt" }).unit(NetatmoDataType.WIND_STRENGTH)).toBe("KT");
	});
});

describe("icon()", () => {
	test.each([
		["up", "fa fa-caret-up"],
		["down", "fa fa-caret-down"],
		["stable", "fa fa-caret-right"],
		["nonsense", ""]
	])("trend icon for %s", (trend, expected) => {
		expect(metric().icon(NetatmoDataType.TEMP_TREND, trend)).toBe(expected);
	});

	test.each([
		[96, "fa fa-battery-full"],
		[70, "fa fa-battery-three-quarters"],
		[45, "fa fa-battery-half"],
		[15, "fa fa-battery-quarter"],
		[5, "fa fa-battery-empty"]
	])("battery icon at %d%%", (value, expected) => {
		expect(metric().icon(NetatmoDataType.BATTERY, value)).toBe(expected);
	});

	test("wind icon falls back to strong-wind for negative values", () => {
		expect(metric().icon(NetatmoDataType.WIND_STRENGTH, -1)).toBe("wi wi-strong-wind");
	});

	test("wind icon reports a beaufort scale for non-negative values", () => {
		expect(metric().icon(NetatmoDataType.WIND_STRENGTH, 36)).toBe("wi wi-wind-beaufort-5");
	});

	test("wind angle icon includes the degree value", () => {
		expect(metric().icon(NetatmoDataType.WIND_ANGLE, 180)).toBe("wi wi-wind from-180-deg");
	});

	test("negative wind angle falls back to 0 degrees", () => {
		expect(metric().icon(NetatmoDataType.WIND_ANGLE, -5)).toBe("wi wi-wind from-0-deg");
	});

	test.each([
		[75, "fa fa-volume-up"],
		[55, "fa fa-volume-down"],
		[30, "fa fa-volume-off"]
	])("noise icon at %d dB", (value, expected) => {
		expect(metric().icon(NetatmoDataType.NOISE, value)).toBe(expected);
	});

	test.each([
		[NetatmoDataType.CO2, 0, ""],
		[NetatmoDataType.HUMIDITY, 0, "wi wi-humidity"],
		[NetatmoDataType.WIFI, 0, "fa fa-wifi"],
		[NetatmoDataType.RADIO, 0, "fa fa-signal"],
		[NetatmoDataType.RAIN, 0, "wi wi-raindrop"],
		[NetatmoDataType.SUM_RAIN_1, 0, "wi wi-raindrop"],
		[NetatmoDataType.SUM_RAIN_24, 0, "wi wi-raindrop"],
		[NetatmoDataType.PRESSURE, 0, "wi wi-barometer"],
		[NetatmoDataType.TEMP_MIN, 0, "fa fa-thermometer-empty"],
		[NetatmoDataType.TEMP_MAX, 0, "fa fa-thermometer-full"],
		["SomeUnknownType", 0, ""]
	])("icon for %s", (dataType, value, expected) => {
		expect(metric().icon(dataType, value)).toBe(expected);
	});
});

describe("status()", () => {
	test("returns empty string when there is no reading, but still classifies a real zero reading", () => {
		expect(metric().status(NetatmoDataType.CO2, undefined)).toBe("");
		expect(metric().status(NetatmoDataType.CO2, "NA")).toBe("");
		expect(metric().status(NetatmoDataType.CO2, 0)).toBe("good");
	});

	test.each([
		[800, "good"],
		[1600, "average"],
		[1601, "bad"]
	])("CO2 status at %d", (value, expected) => {
		expect(metric().status(NetatmoDataType.CO2, value)).toBe(expected);
	});

	test.each([
		[50, "textgreen"],
		[35, "textorange"],
		[65, "textorange"],
		[25, "textred"],
		[75, "textpurple"]
	])("humidity status at %d", (value, expected) => {
		expect(metric().status(NetatmoDataType.HUMIDITY, value)).toBe(expected);
	});

	test.each([
		[71, "textred"],
		[51, "textorange"],
		[50, "textgreen"]
	])("noise status at %d", (value, expected) => {
		expect(metric().status(NetatmoDataType.NOISE, value)).toBe(expected);
	});

	test.each([
		[70, "textgreen"],
		[45, "textyellow"],
		[15, "textorange"],
		[5, "textred"]
	])("battery status at %d%%", (value, expected) => {
		expect(metric().status(NetatmoDataType.BATTERY, value)).toBe(expected);
	});

	test.each([
		[59, "textgreen"],
		[85, "textorange"],
		[86, "textred"]
	])("wifi status at %d", (value, expected) => {
		expect(metric().status(NetatmoDataType.WIFI, value)).toBe(expected);
	});

	test.each([
		[70, "textgreen"],
		[45, "textyellow"],
		[15, "textorange"],
		[5, "textred"]
	])("radio status at %d", (value, expected) => {
		expect(metric().status(NetatmoDataType.RADIO, value)).toBe(expected);
	});

	test("returns empty string for a data type with no status mapping", () => {
		expect(metric().status("SomeUnknownType", 42)).toBe("");
	});
});

describe("unit conversions", () => {
	test("kmh2ms", () => expect(metric().kmh2ms(36)).toBeCloseTo(10, 3));
	test("kmh2kt", () => expect(metric().kmh2kt(100)).toBeCloseTo(53.99568, 3));
	test("kmh2mph", () => expect(metric().kmh2mph(100)).toBeCloseTo(62.1371, 3));
	test("tempC2F", () => expect(metric().tempC2F(100)).toBe(212));
	test("mm2Inch", () => expect(metric().mm2Inch(25.4)).toBeCloseTo(1, 5));

	test("kmh2Beaufort clamps at 12 for extreme wind speeds", () => {
		expect(Number(metric().kmh2Beaufort(300))).toBe(12);
	});
});

describe("deg2Cardinal()", () => {
	test.each([
		[0, "N"],
		[11.25, "N"],
		[22.5, "NNE"],
		[45, "NE"],
		[67.5, "ENE"],
		[90, "E"],
		[112.5, "ESE"],
		[135, "SE"],
		[157.5, "SSE"],
		[180, "S"],
		[202.5, "SSW"],
		[225, "SW"],
		[247.5, "WSW"],
		[270, "W"],
		[292.5, "WNW"],
		[315, "NW"],
		[337.5, "NNW"],
		[348.76, "N"]
	])("%d degrees -> %s", (deg, expected) => {
		expect(metric().deg2Cardinal(deg)).toBe(expected);
	});
});

describe("aqiCategory()", () => {
	test("is exposed both standalone and via create()", () => {
		expect(NetatmoFormatter.aqiCategory(10)).toBe(metric().aqiCategory(10));
	});

	test.each([
		[0, "AQI_GOOD"],
		[50, "AQI_GOOD"],
		[51, "AQI_MODERATE"],
		[100, "AQI_MODERATE"],
		[101, "AQI_UNHEALTHY_SENSITIVE"],
		[150, "AQI_UNHEALTHY_SENSITIVE"],
		[151, "AQI_UNHEALTHY"],
		[200, "AQI_UNHEALTHY"],
		[201, "AQI_VERY_UNHEALTHY"],
		[300, "AQI_VERY_UNHEALTHY"],
		[301, "AQI_HAZARDOUS"],
		[500, "AQI_HAZARDOUS"]
	])("AQI %d -> %s", (aqi, expected) => {
		expect(NetatmoFormatter.aqiCategory(aqi)).toBe(expected);
	});

	test("returns UNDEFINED for non-numeric input", () => {
		expect(NetatmoFormatter.aqiCategory(NaN)).toBe("UNDEFINED");
		expect(NetatmoFormatter.aqiCategory(undefined)).toBe("UNDEFINED");
	});
});

describe("aqiGaugeAngle()", () => {
	test("is exposed both standalone and via create()", () => {
		expect(NetatmoFormatter.aqiGaugeAngle(75)).toBe(metric().aqiGaugeAngle(75));
	});

	test.each([
		[0, 0],
		[50, 30],
		[100, 60],
		[150, 90],
		[200, 120],
		[300, 150],
		[400, 180]
	])("AQI %d sits at the top of its band (%d deg)", (aqi, expected) => {
		expect(NetatmoFormatter.aqiGaugeAngle(aqi)).toBeCloseTo(expected, 5);
	});

	test.each([
		[25, 15],
		[75, 45],
		[125, 75],
		[175, 105],
		[250, 135],
		[350, 165]
	])("AQI %d sits mid-band (%d deg)", (aqi, expected) => {
		expect(NetatmoFormatter.aqiGaugeAngle(aqi)).toBeCloseTo(expected, 5);
	});

	test("clamps above the top of the scale instead of sweeping past 180", () => {
		expect(NetatmoFormatter.aqiGaugeAngle(1000)).toBe(180);
	});

	test("clamps negative values to 0", () => {
		expect(NetatmoFormatter.aqiGaugeAngle(-10)).toBe(0);
	});

	test("returns 0 for non-numeric input instead of NaN", () => {
		expect(NetatmoFormatter.aqiGaugeAngle(NaN)).toBe(0);
		expect(NetatmoFormatter.aqiGaugeAngle(undefined)).toBe(0);
	});
});

describe("co2GaugeAngle()", () => {
	test("is exposed both standalone and via create()", () => {
		expect(NetatmoFormatter.co2GaugeAngle(1000)).toBe(metric().co2GaugeAngle(1000));
	});

	test.each([
		[0, 0],
		[800, 60],
		[1600, 120],
		[2400, 180]
	])("CO2 %dppm sits at the top of its band (%d deg)", (co2, expected) => {
		expect(NetatmoFormatter.co2GaugeAngle(co2)).toBeCloseTo(expected, 5);
	});

	test.each([
		[400, 30],
		[1200, 90],
		[2000, 150]
	])("CO2 %dppm sits mid-band (%d deg)", (co2, expected) => {
		expect(NetatmoFormatter.co2GaugeAngle(co2)).toBeCloseTo(expected, 5);
	});

	test("clamps above the top of the scale instead of sweeping past 180", () => {
		expect(NetatmoFormatter.co2GaugeAngle(5000)).toBe(180);
	});

	test("clamps negative values to 0", () => {
		expect(NetatmoFormatter.co2GaugeAngle(-10)).toBe(0);
	});

	test("returns 0 for non-numeric input instead of NaN", () => {
		expect(NetatmoFormatter.co2GaugeAngle(NaN)).toBe(0);
		expect(NetatmoFormatter.co2GaugeAngle(undefined)).toBe(0);
	});
});

describe("pollutantLabel()", () => {
	test.each([
		["pm25", "PM2.5"],
		["PM25", "PM2.5"],
		["pm10", "PM10"],
		["o3", "O3"],
		["no2", "NO2"],
		["so2", "SO2"],
		["co", "CO"]
	])("%s -> %s", (code, expected) => {
		expect(NetatmoFormatter.pollutantLabel(code)).toBe(expected);
	});

	test("falls back to uppercasing an unrecognized code", () => {
		expect(NetatmoFormatter.pollutantLabel("nh3")).toBe("NH3");
	});

	test("returns empty string for no code", () => {
		expect(NetatmoFormatter.pollutantLabel(undefined)).toBe("");
		expect(NetatmoFormatter.pollutantLabel("")).toBe("");
	});
});
