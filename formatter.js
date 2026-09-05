/* Netatmo data formatting: unit conversion, thresholds, icons, status colors.
 * Pure logic with no DOM/jQuery dependency, so it loads both as a browser
 * global (via getScripts in MMM-Netatmo.js) and as a CommonJS module (Jest).
 */
(function (root, factory) {
	if (typeof module === "object" && module.exports) {
		module.exports = factory();
	} else {
		root.NetatmoFormatter = factory();
	}
}(typeof self !== "undefined" ? self : this, function () {

	// EPA AQI breakpoints, https://helpcenter.netatmo.com/hc/en-us/articles/17069028550930
	// Doesn't depend on naValue/units/windUnit, so it's also exported standalone below.
	function aqiCategory(aqi) {
		if (isNaN(aqi)) { return "UNDEFINED"; }
		if (aqi <= 50) { return "AQI_GOOD"; }
		if (aqi <= 100) { return "AQI_MODERATE"; }
		if (aqi <= 150) { return "AQI_UNHEALTHY_SENSITIVE"; }
		if (aqi <= 200) { return "AQI_UNHEALTHY"; }
		if (aqi <= 300) { return "AQI_VERY_UNHEALTHY"; }
		return "AQI_HAZARDOUS";
	}

	// Maps a value onto a 0-180deg gauge sweep, piecewise-linear across `breakpoints`,
	// so each interval between breakpoints gets an equal-width wedge regardless of its
	// numeric width (values at/above the last breakpoint are capped at 180deg).
	function gaugeAngle(value, breakpoints) {
		if (isNaN(value)) { return 0; }
		var bandWidth = 180 / (breakpoints.length - 1);
		var max = breakpoints[breakpoints.length - 1];
		var clamped = Math.max(0, Math.min(value, max));
		for (var i = 0; i < breakpoints.length - 1; i++) {
			var lower = breakpoints[i];
			var upper = breakpoints[i + 1];
			if (clamped <= upper) {
				return i * bandWidth + ((clamped - lower) / (upper - lower)) * bandWidth;
			}
		}
		return 180;
	}

	// EPA AQI breakpoints -> equal 30deg wedges per category (301+ capped at the top
	// of the last wedge).
	var AQI_GAUGE_BREAKPOINTS = [0, 50, 100, 150, 200, 300, 400];
	function aqiGaugeAngle(aqi) {
		return gaugeAngle(aqi, AQI_GAUGE_BREAKPOINTS);
	}

	// Same good/average/bad breakpoints as the status() CO2 case below -> equal
	// 60deg wedges (2400+ capped at the top of the last wedge).
	var CO2_GAUGE_BREAKPOINTS = [0, 800, 1600, 2400];
	function co2GaugeAngle(co2) {
		return gaugeAngle(co2, CO2_GAUGE_BREAKPOINTS);
	}

	var POLLUTANT_LABELS = {
		pm25: "PM2.5",
		pm10: "PM10",
		o3: "O3",
		no2: "NO2",
		so2: "SO2",
		co: "CO"
	};
	function pollutantLabel(code) {
		if (!code) { return ""; }
		return POLLUTANT_LABELS[code.toLowerCase()] || code.toUpperCase();
	}

	// naValue/units/windUnit are captured once per call and never mutated,
	// so the returned object has no shared/mutable state of its own.
	function create(NetatmoDataType, config) {
		config = config || {};
		var naValue = config.naValue || "NA";
		var units = config.units || "metric";
		var windUnit = config.windUnit || "kmh";

		return {
			value: function (dataType, value) {
				if (value === undefined || value === null || value === naValue) { return value; }
				switch (dataType) {
					case NetatmoDataType.CO2:
						return value.toFixed(0);
					case NetatmoDataType.NOISE:
						return value.toFixed(0);
					case NetatmoDataType.HUMIDITY:
						return value.toFixed(0);
					case NetatmoDataType.RAIN:
					case NetatmoDataType.SUM_RAIN_1:
					case NetatmoDataType.SUM_RAIN_24:
						if (units.toUpperCase() === "IMPERIAL") {
							return this.mm2Inch(value).toFixed(3);
						}
						return value.toFixed(1);
					case NetatmoDataType.GUST_ANGLE:
					case NetatmoDataType.WIND_ANGLE_MAX:
					case NetatmoDataType.WIND_ANGLE:
						return value.toFixed(0);
					case NetatmoDataType.WIND_STRENGTH:
					case NetatmoDataType.GUST_STRENGTH:
					case NetatmoDataType.WIND_STRENGTH_MAX:
						switch (windUnit.toUpperCase()) {
							case "BFT":
								return this.kmh2Beaufort(value);
							case "MPH":
								return this.kmh2mph(value).toFixed(0);
							case "MS":
								return this.kmh2ms(value).toFixed(1);
							case "KT":
								return this.kmh2kt(value).toFixed(1);
							case "KMH":
							default:
								return value.toFixed(0);
						}
					case NetatmoDataType.HEALTH_IDX: //Air Quality Health Index
						if (value === 0) { return "Healthy"; }
						if (value === 1) { return "Fine"; }
						if (value === 2) { return "Fair"; }
						if (value === 3) { return "Poor"; }
						if (value === 4) { return "Unhealthy"; }
						return value;
					case NetatmoDataType.BATTERY:
					case NetatmoDataType.RADIO:
						return value.toFixed(0);
					case NetatmoDataType.WIFI:
					case NetatmoDataType.PRESSURE:
						return value.toFixed(0);
					case NetatmoDataType.TEMPERATURE:
					case NetatmoDataType.TEMP_MIN:
					case NetatmoDataType.TEMP_MAX:
						if (units.toUpperCase() === "IMPERIAL") {
							return this.tempC2F(value).toFixed(1);
						}
						return value.toFixed(1);
					default:
						return value;
				}
			},
			unit: function (dataType) {
				switch (dataType) {
					case NetatmoDataType.CO2:
						return "PPM";
					case NetatmoDataType.NOISE:
						return "DB";
					case NetatmoDataType.HUMIDITY:
					case NetatmoDataType.BATTERY:
					case NetatmoDataType.RADIO:
						return "%";
					case NetatmoDataType.WIFI:
						return "DBM";
					case NetatmoDataType.RAIN:
						if (units.toUpperCase() === "IMPERIAL") {
							return "INCH";
						}
						return "MM";
					case NetatmoDataType.SUM_RAIN_1:
						return "1H";
					case NetatmoDataType.SUM_RAIN_24:
						return "24H";
					case NetatmoDataType.GUST_STRENGTH:
					case NetatmoDataType.WIND_STRENGTH:
					case NetatmoDataType.WIND_STRENGTH_MAX:
						return windUnit.toUpperCase();
					case NetatmoDataType.PRESSURE:
						return "MBAR";
					case NetatmoDataType.GUST_ANGLE:
					case NetatmoDataType.WIND_ANGLE:
					case NetatmoDataType.WIND_ANGLE_MAX:
					case NetatmoDataType.TEMPERATURE:
					case NetatmoDataType.TEMP_MIN:
					case NetatmoDataType.TEMP_MAX:
						return "°";
					default:
						return "";
				}
			},
			icon: function (dataType, value) {
				switch (dataType) {
					case NetatmoDataType.PRESSURE_TREND:
					case NetatmoDataType.TEMP_TREND:
						return value === "up" ? "fa fa-caret-up" : value === "down" ? "fa fa-caret-down" : value === "stable" ? "fa fa-caret-right" : "";
					case NetatmoDataType.CO2:
						return "";
					case NetatmoDataType.NOISE:
						//70dB vacuum cleaner. 40dB: library
						return value > 70 ? "fa fa-volume-up" : value > 50 ? "fa fa-volume-down" : "fa fa-volume-off";
					case NetatmoDataType.HUMIDITY:
						return "wi wi-humidity";
					case NetatmoDataType.BATTERY:
						return value > 95 ? "fa fa-battery-full" : value >= 70 ? "fa fa-battery-three-quarters" : value >= 45 ? "fa fa-battery-half" : value >= 15 ? "fa fa-battery-quarter" : "fa fa-battery-empty";
					case NetatmoDataType.WIFI:
						return "fa fa-wifi";
					case NetatmoDataType.RADIO:
						return "fa fa-signal";
					case NetatmoDataType.RAIN:
					case NetatmoDataType.SUM_RAIN_1:
					case NetatmoDataType.SUM_RAIN_24:
						return "wi wi-raindrop";
					case NetatmoDataType.GUST_STRENGTH:
					case NetatmoDataType.WIND_STRENGTH:
					case NetatmoDataType.WIND_STRENGTH_MAX:
						if (value < 0) { return "wi wi-strong-wind"; }
						var valueBFT = this.kmh2Beaufort(value);
						if (valueBFT >= 0) {
							return "wi wi-wind-beaufort-" + valueBFT;
						}
						return "wi wi-strong-wind";
					case NetatmoDataType.GUST_ANGLE:
					case NetatmoDataType.WIND_ANGLE:
					case NetatmoDataType.WIND_ANGLE_MAX:
						if (value < 0) { return "wi wi-wind from-0-deg"; }
						return "wi wi-wind from-" + value + "-deg";
					case NetatmoDataType.PRESSURE:
						return "wi wi-barometer";
					case NetatmoDataType.TEMPERATURE:
					case NetatmoDataType.TEMP_MIN:
						return "fa fa-thermometer-empty";
					case NetatmoDataType.TEMP_MAX:
						return "fa fa-thermometer-full";
					default:
						return "";
				}
			},
			status: function (dataType, value) {
				if (value === undefined || value === null || value === naValue) { return ""; }
				switch (dataType) {
					case NetatmoDataType.CO2:
						return value <= 800 ? "good" : value <= 1600 ? "average" : "bad";
					case NetatmoDataType.NOISE:
						//70dB vacuum cleaner. 40dB: library
						return value > 70 ? "textred" : value > 50 ? "textorange" : "textgreen";
					case NetatmoDataType.BATTERY:
						return value >= 70 ? "textgreen" : value >= 45 ? "textyellow" : value >= 15 ? "textorange" : "textred";
					case NetatmoDataType.WIFI:
						return value < 60 ? "textgreen" : value < 86 ? "textorange" : "textred";
					case NetatmoDataType.RADIO:
						return value >= 70 ? "textgreen" : value >= 45 ? "textyellow" : value >= 15 ? "textorange" : "textred";
					case NetatmoDataType.HUMIDITY:
						var status = "";
						if (value >= 40 && value <= 60) {
							status = "textgreen";
						} else if (value < 40 && value > 30 || value < 70 && value > 60) {
							status = "textorange";
						} else if (value <= 30) {
							status = "textred";
						} else if (value >= 70) {
							status = "textpurple";
						}
						return status;
					default:
						return "";
				}
			},
			kmh2ms: function (kmh) {
				// https://www.weather.gov/media/epz/wxcalc/windConversion.pdf
				return 0.277778 * kmh;
			},
			kmh2Beaufort: function (kmh) {
				//http://www.home.hs-karlsruhe.de/~pach0003/informatik_1/aufgaben/en/doc/src-html/de/hska/java/exercises/objects/WindSpeed.html#line.59
				var beaufort = (Math.pow(kmh / 3.01, 0.6666)).toFixed(0);
				if (beaufort > 12) {
					beaufort = 12;
				}
				return beaufort;
			},
			kmh2kt: function (kmh) {
				// https://www.weather.gov/media/epz/wxcalc/windConversion.pdf
				return 0.5399568 * kmh;
			},
			kmh2mph: function (kmh) {
				// https://www.weather.gov/media/epz/wxcalc/windConversion.pdf
				return 0.621371 * kmh;
			},
			tempC2F: function (c) {
				return (1.8 * c) + 32;
			},
			mm2Inch: function (mm) {
				return mm / 25.4;
			},
			deg2Cardinal: function (deg) {
				if (deg > 11.25 && deg <= 33.75) {
					return "NNE";
				} else if (deg > 33.75 && deg <= 56.25) {
					return "NE";
				} else if (deg > 56.25 && deg <= 78.75) {
					return "ENE";
				} else if (deg > 78.75 && deg <= 101.25) {
					return "E";
				} else if (deg > 101.25 && deg <= 123.75) {
					return "ESE";
				} else if (deg > 123.75 && deg <= 146.25) {
					return "SE";
				} else if (deg > 146.25 && deg <= 168.75) {
					return "SSE";
				} else if (deg > 168.75 && deg <= 191.25) {
					return "S";
				} else if (deg > 191.25 && deg <= 213.75) {
					return "SSW";
				} else if (deg > 213.75 && deg <= 236.25) {
					return "SW";
				} else if (deg > 236.25 && deg <= 258.75) {
					return "WSW";
				} else if (deg > 258.75 && deg <= 281.25) {
					return "W";
				} else if (deg > 281.25 && deg <= 303.75) {
					return "WNW";
				} else if (deg > 303.75 && deg <= 326.25) {
					return "NW";
				} else if (deg > 326.25 && deg <= 348.75) {
					return "NNW";
				} else {
					return "N";
				}
			},
			aqiCategory: aqiCategory,
			aqiGaugeAngle: aqiGaugeAngle,
			co2GaugeAngle: co2GaugeAngle,
			pollutantLabel: pollutantLabel
		};
	}

	return {
		create: create,
		aqiCategory: aqiCategory,
		aqiGaugeAngle: aqiGaugeAngle,
		co2GaugeAngle: co2GaugeAngle,
		pollutantLabel: pollutantLabel
	};
}));
