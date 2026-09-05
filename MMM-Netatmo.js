/* Magic Mirror Module: Netatmo
 * inspired
 * By Christopher Fenner http://github.com/CFenner
 * MIT Licensed.
 */

/* global moment, Module, Log, NetatmoFormatter */

// Manage the PIR and the module.hidden at the same time
var UserPresence = true; // by default we are present (no PIR sensor to cut)
var ModuleNetatmoHidden = false; /// by default  display the module (if no carousel module or other)

var lastUpdateServeurNetatmo = 0; // Used to memorize the timestamp given by netatmo on the date of his info. New info every 10 min
var DateUpdateDataAirQuality = 0; // The last date we updated the info Air Quality min

var AirQualityImpact = "Wait..";
var AirQualityValue = 0; //Initial air quality
var AirQualityPollutant = "";

//Mapping Modules and order. This way they can be referenced from any function.
let ModuleMap = new Map();
// Map devicenames to Devicetypes
let ModuleTypeMap = new Map();
//let NAValue = "--";
let NAValue = "NA";
let WindUnit = "kmh";
let Units = "metric";

const NetatmoModuleType = {
	MAIN: "NAMain",
	INDOOR: "NAModule4",
	OUTDOOR: "NAModule1",
	RAIN: "NAModule3",
	WIND: "NAModule2",
	HEALTH: "NHC",
};

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
	HEALTH_IDX: "health_idx", //Air Quality Health Index
};

// Small vanilla-DOM helpers replacing the previous jQuery-based rendering.
function el(tag, className) {
	var node = document.createElement(tag);
	if (className) { node.className = className; }
	return node;
}
// Joins class name fragments, dropping empty ones -- e.g. cls("a", formatter.icon(...))
// where icon() can return "" -- the way jQuery's .addClass("") silently no-ops.
function cls() {
	return Array.prototype.slice.call(arguments).filter(Boolean).join(" ");
}
function append(parent, content) {
	if (content === undefined || content === null) { return parent; }
	if (content instanceof Node) {
		parent.appendChild(content);
	} else {
		parent.appendChild(document.createTextNode(String(content)));
	}
	return parent;
}
// Only for developer-authored content (translation strings, e.g. "CO<sub>2</sub>") --
// never for Netatmo/aqicn-sourced values, which must go through append()/setText().
function appendMarkup(parent, html) {
	parent.insertAdjacentHTML("beforeend", String(html));
	return parent;
}
function setText(node, text) {
	node.textContent = (text === undefined || text === null) ? "" : String(text);
	return node;
}
function parseMarkup(html) {
	var container = document.createElement("div");
	container.innerHTML = html;
	return container.firstElementChild;
}

// SVG elements need createElementNS + setAttribute("class", ...) -- assigning
// .className on an SVGElement sets a read-only SVGAnimatedString, not a plain
// string, so el()/cls() above don't work for them.
var SVG_NS = "http://www.w3.org/2000/svg";
function svgEl(tag, attrs) {
	var node = document.createElementNS(SVG_NS, tag);
	if (attrs) {
		for (var key in attrs) {
			if (Object.prototype.hasOwnProperty.call(attrs, key)) {
				node.setAttribute(key, attrs[key]);
			}
		}
	}
	return node;
}
function polarPoint(cx, cy, r, mathDegrees) {
	var rad = mathDegrees * Math.PI / 180;
	return { x: cx + r * Math.cos(rad), y: cy - r * Math.sin(rad) };
}
// gaugeDeg 0 = left (AQI min), gaugeDeg 180 = right (AQI max), sweeping over the top.
function gaugeArcPath(cx, cy, r, gaugeStartDeg, gaugeEndDeg) {
	var start = polarPoint(cx, cy, r, 180 - gaugeStartDeg);
	var end = polarPoint(cx, cy, r, 180 - gaugeEndDeg);
	return "M " + start.x.toFixed(2) + " " + start.y.toFixed(2)
		+ " A " + r + " " + r + " 0 0 1 " + end.x.toFixed(2) + " " + end.y.toFixed(2);
}

Module.register("MMM-Netatmo", {
	// default config,
	defaults: {
		debug: false, // set true for verbose per-tick update-scheduling logs
		units: config.units,
		//for AirQuality (outdoor, via aqicn.org)
		aqicnToken: null, // required: get a free token at https://aqicn.org/data-platform/token/
		location: "germany/berlin",
		updateIntervalAirQuality: 600, // en secondes = every 30 minutes
		refreshToken: null,
		updatesIntervalDisplay: 60,
		animationSpeed: 1000,
		updatesIntervalDisplayID: 0,
		lastMessageThreshold: 600, // in seconds (10 minutes)
		horizontal: false,
		horizontalOverflow: false,
		windUnit: "kmh", // Possible "KMH", "MPH", "MS", "BFT", "KT"
		displayWindInOutdoor: false,
		displayRainInOutdoor: false,
		showLastMessage: true,
		showDataIcon: true,
		showDataHeader: true,
		showModuleStatus: true,
		showModuleFirmware: true,
		NAValue: "--",
		moduleOrder: [], // optional; omit to display every module/device
		api: {
			base: "https://api.netatmo.com/",
			authEndpoint: "oauth2/token",
			dataEndpoint: "api/getstationsdata"
		}
	},

	// init method
	start: function () {
		Log.info("Starting module: " + this.name);//First time at the launch of the mirror

		// run upload for the first time, everyone will remember their upload date
		this.updateLoad();
		this.loadAirQuality();
		// is useless because called by resume and values of dates have no time to memorize before...
		// if it serves, because resume is not always called at startup ...

		// set a timer to manage uploads and displays whether or not there is a presence
		this.config.updatesIntervalDisplayID = setInterval(() => {
			this.GestionUpdateIntervalNetatmo();
		}, this.config.updatesIntervalDisplay * 1000);

		//	Log.log("End function start, updatesIntervalDisplayID : " + this.config.updatesIntervalDisplayID);

	},

	suspend: function () { // core called when the module is hidden
		ModuleNetatmoHidden = true; //module hidden
		Log.log("Suspend - Module Netatmo hidden");
		this.GestionUpdateIntervalNetatmo(); //when called the function that handles all cases
	},

	resume: function () { // core called when the module is displayed
		ModuleNetatmoHidden = false;
		Log.log("Resume - Module Netatmo display");
		this.GestionUpdateIntervalNetatmo();
	},

	notificationReceived: function (notification, payload) {
		if (notification === "USER_PRESENCE") { // notification sent by the MMM-PIR-Sensor module. See his doc
			Log.log("NotificationReceived USER_PRESENCE = " + payload);
			UserPresence = payload;
			this.GestionUpdateIntervalNetatmo();
		}
	},

	socketNotificationReceived: function (notification, payload) {
		// node_helper.js broadcasts to every MMM-Netatmo instance; ignore notifications meant for other instances.
		if (!payload || payload.identifier !== this.identifier) { return; }

		if (notification === "NETATMO_DATA") {
			this.config.refreshToken = payload.refreshToken;
			this.renderAll(payload.data);
		} else if (notification === "NETATMO_ERROR") {
			this.renderError(payload.error);
		} else if (notification === "NETATMO_AQI_DATA") {
			this.renderAirQuality(payload);
		} else if (notification === "NETATMO_AQI_ERROR") {
			Log.error(this.name + ": " + payload.error);
		}
	},

	GestionUpdateIntervalNetatmo: function () {

		// This runs every updatesIntervalDisplay seconds for the module's entire
		// lifetime, so the verbose diagnostics (moment formatting, etc.) are gated
		// behind config.debug instead of running unconditionally on every tick.
		if (this.config.debug) {
			Log.log("GestionUpdateIntervalNetatmo - Netatmo data: "
				+ moment.unix(lastUpdateServeurNetatmo).format("dd - HH:mm:ss") +
				" - AirQuality data : " + moment.unix(DateUpdateDataAirQuality).format("dd - HH:mm:ss") +
				" - and we are : " + moment.unix(Date.now() / 1000).format("dd - HH:mm:ss"));
		}

		// make sure to have a user present in front of the screen (sensor PIR) and that the module is well displayed
		if (UserPresence === true && ModuleNetatmoHidden === false) {

			if (Date.now() / 1000 - DateUpdateDataAirQuality > this.config.updateIntervalAirQuality) {
				Log.log("Data AirQuality have more than " + this.config.updateIntervalAirQuality + " s, update requested");
				this.loadAirQuality();
			} else if (this.config.debug) {
				var calcul = Date.now() / 1000 - DateUpdateDataAirQuality;
				Log.log("Data AirQuality ont :" + calcul +
					"it's less " + this.config.updateIntervalAirQuality + " s, we do not update");
			}

			if (Date.now() / 1000 - lastUpdateServeurNetatmo > 660) {// we are more than 11min after the last datas of the server -> it is necessary to update

				Log.log("Data Netatmo have more than 11 min, update requested");
				this.updateLoad();
			} else if (this.config.debug) {
				Log.log("Data Netatmo are less than 11 min, no update");
			}

			//Reset the update interval, if not already active (to avoid multiple instances)
			if (this.config.updatesIntervalDisplayID === 0) {

				this.config.updatesIntervalDisplayID = setInterval(() => {
					this.GestionUpdateIntervalNetatmo();
				}, this.config.updatesIntervalDisplay * 1000);

				Log.log("Netatmo timer in place, updatesIntervalDisplayID : " + this.config.updatesIntervalDisplayID);

			}

		} else { //sinon (UserPresence = false OU ModuleHidden = true)

			clearInterval(this.config.updatesIntervalDisplayID); // stop the current update interval
			this.config.updatesIntervalDisplayID = 0; // we reset the variable
		}
	},

	//Air Quality
	loadAirQuality: function () {
		if (!this.config.aqicnToken) {
			if (!this._aqicnTokenWarned) {
				Log.warn(this.name + ": no aqicnToken configured, skipping outdoor air quality lookup. See README for how to get a free token from aqicn.org.");
				this._aqicnTokenWarned = true;
			}
			return;
		}

		// aqicn.org data is fetched via node_helper.js (see NETATMO_FETCH_AQI)
		this.sendSocketNotification("NETATMO_FETCH_AQI", {
			identifier: this.identifier,
			city: this.config.location,
			token: this.config.aqicnToken
		});
	},

	renderAirQuality: function (payload) {

		AirQualityValue = payload.aqi;
		AirQualityImpact = this.translate(NetatmoFormatter.aqiCategory(payload.aqi));
		AirQualityPollutant = NetatmoFormatter.pollutantLabel(payload.dominantPollutant);

		//We memorize the date of our data upload
		DateUpdateDataAirQuality = Date.now() / 1000;

	},

	//fin airquality

	updateLoad: function () {
		Log.log("Netatmo : updateLoad"); //Every 10 min (update interval), step 1 of the update

		// The token refresh and getstationsdata call happen in node_helper.js so that
		// clientSecret/refreshToken/access_token never enter the renderer process.
		this.sendSocketNotification("NETATMO_FETCH_DATA", {
			identifier: this.identifier,
			api: this.config.api,
			clientId: this.config.clientId,
			clientSecret: this.config.clientSecret,
			refreshToken: this.config.refreshToken
		});
	},

	renderAll: function (data) {

		// Log.log("Netatmo : renderAll");
		// Log.info(this.name + " data loaded, updated "+moment(new Date(1000*device.dashboard_data.time_utc)).fromNow());
		var device = data.body.devices[0];
		this.lastUpdate = device.dashboard_data.time_utc;
		lastUpdateServeurNetatmo = device.dashboard_data.time_utc;
		// render modules
		this.dom = this.getDesign("bubbles").render(device);
		this.updateDom(this.config.animationSpeed);
	},

	renderError: function (reason) {
		console.log("error " + reason);
	},
	getDesign: function (design) {

		//	Log.log("Netatmo : getDesign");
		var that = this;
		var formatter = NetatmoFormatter.create(NetatmoDataType, { naValue: NAValue, units: Units, windUnit: WindUnit });
		var translator = this.translate;
		return {
			bubbles: (function (formatter, translator, that) {
				return {
					getValue: function (module, datatype, isDashboardData, translate) {
						let value;
						if (isDashboardData) {
							value = typeof module.dashboard_data !== "undefined" ? (module.dashboard_data[datatype]) : NAValue;
						}
						else {
							value = typeof module[datatype] !== "undefined" ? (module[datatype]) : NAValue;
						}
						return value = (translate) ? translator.bind(that)(value.toUpperCase()) : value;
					},
					getUnit: function (datatype) {
						let unit = formatter.unit(datatype);
						return translator.bind(that)(unit.toUpperCase());
					},
					render: function (device) {
						ModuleMap = new Map();
						if (that.config.NAValue && that.config.moduleOrder.length > 0) { NAValue = that.config.NAValue; }
						if (that.config.windUnit) { WindUnit = that.config.windUnit; }
						if (that.config.units) { Units = that.config.units; }
						formatter = NetatmoFormatter.create(NetatmoDataType, { naValue: NAValue, units: Units, windUnit: WindUnit });
						var sResult = el("div", "modules bubbles");
						if (that.config.horizontal) {
							sResult.classList.add("horizontal");
							if (that.config.horizontalOverflow) { sResult.classList.add("overflow"); }
						}

						if (that.config.moduleOrder && that.config.moduleOrder.length > 0) {
							for (var moduleName of that.config.moduleOrder) {
								if (device.module_name.toUpperCase() === moduleName.toUpperCase()) {
									Log.log("MMM-Netatmo Device will be mapped: " + device.module_name);
									ModuleMap.set(device.module_name, device);
									ModuleTypeMap.set(device.type, device.module_name);
								} else {
									for (var module of device.modules) {
										if (module.module_name.toUpperCase() === moduleName.toUpperCase()) {
											Log.log("MMM-Netatmo Module will be mapped: " + module.module_name);
											ModuleMap.set(module.module_name, module);
											if (module.type === NetatmoModuleType.INDOOR) {
												let indoor = [];
												if (ModuleTypeMap.has(NetatmoModuleType.INDOOR)) { let indoor = ModuleTypeMap.get(NetatmoModuleType.INDOOR); }
												indoor.push(module.module_name);
												ModuleTypeMap.set(module.type, indoor);
											}
											else {
												ModuleTypeMap.set(module.type, module.module_name);
											}
										}
									}
								}
							}
						}
						else {
							Log.log("MMM-Netatmo Device will be mapped: " + device.module_name);
							ModuleMap.set(device.module_name, device);
							//ModuleTypeMap.set(device.type, device.module_name);
							for (var cnt = 0; cnt < device.modules.length; cnt++) {
								Log.log("MMM-Netatmo Module will be mapped: " + device.modules[cnt].module_name);
								ModuleMap.set(device.modules[cnt].module_name, device.modules[cnt]);
								if (device.modules[cnt].type === NetatmoModuleType.INDOOR) {
									let indoor = [];
									if (ModuleTypeMap.has(NetatmoModuleType.INDOOR)) { let indoor = ModuleTypeMap.get(NetatmoModuleType.INDOOR); }
									indoor.push(device.modules[cnt].module_name);
									ModuleTypeMap.set(device.modules[cnt].type, indoor);
								}
								else {
									ModuleTypeMap.set(device.modules[cnt].type, device.modules[cnt].module_name);
								}
							}
						}

						if (ModuleMap && ModuleMap.size > 0) {
							for (let [moduleName, module] of ModuleMap) {
								switch (module.type) {
									case NetatmoModuleType.MAIN:
									case NetatmoModuleType.INDOOR:
										append(sResult, this.module(module));
										break;
									case NetatmoModuleType.OUTDOOR:
										append(sResult, this.module(module));
										break;

									case NetatmoModuleType.WIND:
										if (!(that.config.displayWindInOutdoor)) {
											append(sResult, this.module(module));
										}
										break;

									case NetatmoModuleType.RAIN:
										if (!(that.config.displayRainInOutdoor)) {
											append(sResult, this.module(module));
										}
										break;
								}
							}
						}
						// Log.log("ModuleTypeMap: " + ModuleTypeMap.size);
						// for (let [key, value] of ModuleTypeMap) {
						// 	Log.log(key + " = " + value);
						// }
						return sResult;
					},
					//Defined the overall structure of the display of each element of the module (indoor, outdoor). The last line being in the getDom
					module: function (module) {
						Log.log("MMM-Netatmo add module: " + module.module_name);
						var result = el("div", "module");
						var title = el("div", "title name xsmall");
						setText(title, module.module_name);
						append(result, title);
						append(result, this.addPrimary(module));
						append(result, this.addSecondary(module));
						if (!(this.addLastSeen(result, module))) {
							append(result, this.addData(module));
						}
						if (that.config.showModuleStatus) { append(result, this.addStatus(module)); }
						append(result, el("div", "line"));
						return result;
					},
					addPrimary: function (module) {
						//Log.log("MMM-Netatmo addPrimary module: " + module.module_name);
						let result = el("div", "primary");
						switch (module.type) {
							case NetatmoModuleType.MAIN:
							case NetatmoModuleType.INDOOR:
							case NetatmoModuleType.OUTDOOR:
								append(result, this.displayTemp(module));
								break;
							case NetatmoModuleType.RAIN:
								append(result, this.displayRain(module));
								break;
							case NetatmoModuleType.WIND:
								append(result, this.displayWind(module));
								break;
							default:
								break;

						}
						return result;
					},
					addSecondary: function (module) {
						//Log.log("MMM-Netatmo addSecondary module: " + module.module_name);
						let result = el("div", "secondary");
						switch (module.type) {
							case NetatmoModuleType.MAIN:
							case NetatmoModuleType.INDOOR:
								append(result, this.displayCO2(module));
								break;
							case NetatmoModuleType.OUTDOOR:
								append(result, this.displayAQI(module));
								break;
							case NetatmoModuleType.RAIN:
								append(result, this.displayRainDrops(module));
								break;
							case NetatmoModuleType.WIND:
								append(result, this.displayWindAngle(module));
								break;
							default:
								break;

						}
						return result;
					},
					addLastSeen: function (parentresult, module) {
						//Log.log("MMM-Netatmo addLastSeen : " + module.module_name);
						let displayLastSeen = false;
						let lastMessage = this.getValue(module, NetatmoDataType.LAST_MESSAGE, false, false);
						if (lastMessage !== NAValue) {
							let duration = Date.now() / 1000 - lastMessage;
							displayLastSeen = that.config.showLastMessage && duration > that.config.lastMessageThreshold;
						}
						if (displayLastSeen) {
							let node = el("div", "displayLastSeen small flash");
							append(node,
								translator.bind(that)(NetatmoDataType.LAST_MESSAGE.toUpperCase())
								+ ": "
								+ moment.unix(lastMessage).fromNow()
							);
							append(parentresult, node);
						}
						return displayLastSeen;
					},
					addData: function (module) {
						//Log.log("MMM-Netatmo addData module: " + module.module_name);
						let result = el("div", "displayData");
						switch (module.type) {
							case NetatmoModuleType.MAIN:
								append(result, this.displayData(module, NetatmoDataType.HUMIDITY, true));
								append(result, this.displayData(module, NetatmoDataType.NOISE, true));
								append(result, this.displayData(module, NetatmoDataType.PRESSURE, true));
								break;
							case NetatmoModuleType.INDOOR:
								append(result, this.displayData(module, NetatmoDataType.HUMIDITY, true));
								break;
							case NetatmoModuleType.OUTDOOR:
								append(result, this.displayData(module, NetatmoDataType.HUMIDITY, true));
								if (that.config.displayRainInOutdoor && ModuleTypeMap.has(NetatmoModuleType.RAIN)) {
									// Add Raindata to Outdoor
									let moduleName = ModuleTypeMap.get(NetatmoModuleType.RAIN);
									if (ModuleMap.has(moduleName)) {
										let rainModule = ModuleMap.get(moduleName);
										append(result, this.displayData(rainModule, NetatmoDataType.RAIN, true));
									}
								}
								if (that.config.displayWindInOutdoor && ModuleTypeMap.has(NetatmoModuleType.WIND)) {
									// Add winddata to Outdoor
									let moduleName = ModuleTypeMap.get(NetatmoModuleType.WIND);
									if (ModuleMap.has(moduleName)) {
										let rainModule = ModuleMap.get(moduleName);
										append(result, this.displayData(rainModule, NetatmoDataType.WIND_STRENGTH, true));
									}
								}

							case NetatmoModuleType.WIND:
							case NetatmoModuleType.RAIN:
							default:
								break;
						}
						return result;
					},
					addStatus: function (module) {
						let result = el("div", "displayStatus");
						switch (module.type) {
							case NetatmoModuleType.MAIN:
								append(result, this.displayData(module, NetatmoDataType.WIFI, false));
								if (that.config.showModuleFirmware) {
									append(result, this.displayData(module, NetatmoDataType.FIRMWARE, false));
								}
								break;
							case NetatmoModuleType.INDOOR:
							case NetatmoModuleType.OUTDOOR:
							case NetatmoModuleType.RAIN:
							case NetatmoModuleType.WIND:
								append(result, this.displayData(module, NetatmoDataType.RADIO, false));
								append(result, this.displayData(module, NetatmoDataType.BATTERY, false));
								if (that.config.showModuleFirmware) {
									append(result, this.displayData(module, NetatmoDataType.FIRMWARE, false));
								}
							default:
								break;
						}
						return result;
					},
					displayTemp: function (module) {
						var result = el("div", "displayTemp");
						let datatype = NetatmoDataType.TEMPERATURE;
						let value = this.getValue(module, NetatmoDataType.TEMPERATURE, true, false);
						let valueMin = this.getValue(module, NetatmoDataType.TEMP_MIN, true, false);
						let valueMax = this.getValue(module, NetatmoDataType.TEMP_MAX, true, false);
						let valueTrend = this.getValue(module, NetatmoDataType.TEMP_TREND, true, false);

						// MAIN Data
						let divData = el("div", datatype);
						let divDataContainer = el("div", "data_container");
						let divDataLeft = el("div", "data_left large light bright");
						append(divDataLeft, formatter.value(datatype, value));
						let divDataRight = el("div", "data_right");
						let divDataRightUp = el("div", "small light bright data_right_up");
						append(divDataRightUp, this.getUnit(datatype));
						append(divDataRight, divDataRightUp);
						append(divDataRight, el("div", cls("medium light bright data_right_down", formatter.icon(NetatmoDataType.TEMP_TREND, valueTrend))));

						append(divDataContainer, divDataLeft);
						append(divDataContainer, divDataRight);
						append(divData, divDataContainer);

						// DATA TEMP MIN MAX
						let divDataContainerBottom = el("div", "data_container_align");
						let divDCBottomMin = el("div", "data_container");
						let divDCBottomMax = el("div", "data_container");
						let divDataIconMin = el("div", cls("data_icon small light dimmed", formatter.icon(NetatmoDataType.TEMP_MIN)));
						let divDataIconMax = el("div", cls("data_icon small light dimmed", formatter.icon(NetatmoDataType.TEMP_MAX)));
						let divDataLeftMin = el("div", "data_left small");
						append(divDataLeftMin, " " + formatter.value(datatype, valueMin));
						let divDataRightMin = el("div", "data_right");
						let divDataRightUpMin = el("div", "xxsmall light data_right_up");
						append(divDataRightUpMin, this.getUnit(NetatmoDataType.TEMP_MIN));
						append(divDataRightMin, divDataRightUpMin);
						let divDataLeftMax = el("div", "data_left small");
						append(divDataLeftMax, " " + formatter.value(datatype, valueMax));
						let divDataRightMax = el("div", "data_right");
						let divDataRightUpMax = el("div", "xxsmall light data_right_up");
						append(divDataRightUpMax, this.getUnit(NetatmoDataType.TEMP_MAX));
						append(divDataRightMax, divDataRightUpMax);
						append(divDCBottomMin, divDataIconMin);
						append(divDCBottomMin, divDataLeftMin);
						append(divDCBottomMin, divDataRightMin);
						append(divDCBottomMax, divDataIconMax);
						append(divDCBottomMax, divDataLeftMax);
						append(divDCBottomMax, divDataRightMax);
						append(divDataContainerBottom, divDCBottomMin);
						append(divDataContainerBottom, divDCBottomMax);
						append(divData, divDataContainerBottom);
						append(result, divData);
						return result;
					},

					displayCO2: function (module) {

						let datatype = NetatmoDataType.CO2;
						let result = el("div", "displayCO2");
						let value = this.getValue(module, datatype, true, false);
						let status = formatter.status(datatype, value);
						let statusClass = this.co2ColorClass[status] || "";
						let labelKey = this.co2GaugeLabelKey[status];

						let divData = el("div", cls(datatype, statusClass));
						let angle = formatter.co2GaugeAngle(value);
						let gaugeValue = formatter.value(datatype, value) + this.getUnit(datatype);
						let gaugeLabel = labelKey ? translator.bind(that)(labelKey) : "";
						append(divData, this.buildGaugeBlock(angle, this.co2GaugeGradientColors, "co2", gaugeValue, gaugeLabel));
						append(result, divData);

						return result;
					},
					displayRain: function (module) {
						var result = el("div", "displayRain");
						let datatype = NetatmoDataType.RAIN;
						let value = this.getValue(module, NetatmoDataType.RAIN, true, false);
						let value1h = this.getValue(module, NetatmoDataType.SUM_RAIN_1, true, false);
						let value24h = this.getValue(module, NetatmoDataType.SUM_RAIN_24, true, false);

						// MAIN DATA
						let divData = el("div", datatype);
						let divDataContainer = el("div", "data_container");
						let divDataLeft = el("div", "data_left large light bright");
						append(divDataLeft, formatter.value(datatype, value));
						let divDataRight = el("div", "data_right");
						let divDataRightUp = el("div", "small light bright data_right_up");
						append(divDataRightUp, this.getUnit(datatype));
						append(divDataRight, divDataRightUp);

						append(divDataContainer, divDataLeft);
						append(divDataContainer, divDataRight);
						append(divData, divDataContainer);

						// DATA Rain 1H and 24H
						let divDataContainerBottom = el("div", "data_container_align");
						let divDCBottom1 = el("div", "data_container");
						let divDCBottom24 = el("div", "data_container");
						let divDataIcon1 = el("div", cls("data_icon small light dimmed", formatter.icon(NetatmoDataType.SUM_RAIN_1)));
						let divDataIcon24 = el("div", cls("data_icon small light dimmed", formatter.icon(NetatmoDataType.SUM_RAIN_24)));
						let divDataLeft1 = el("div", "data_left small");
						append(divDataLeft1, " " + formatter.value(datatype, value1h));
						let divDataRight1 = el("div", "data_right");
						let divDataRightUp1 = el("div", "xxsmall light data_right_up");
						append(divDataRightUp1, this.getUnit(NetatmoDataType.SUM_RAIN_1));
						append(divDataRight1, divDataRightUp1);
						let divDataLeft24 = el("div", "data_left small");
						append(divDataLeft24, " " + formatter.value(datatype, value24h));
						let divDataRight24 = el("div", "data_right");
						let divDataRightUp24 = el("div", "xxsmall light data_right_up");
						append(divDataRightUp24, this.getUnit(NetatmoDataType.SUM_RAIN_24));
						append(divDataRight24, divDataRightUp24);
						append(divDCBottom1, divDataIcon1);
						append(divDCBottom1, divDataLeft1);
						append(divDCBottom1, divDataRight1);
						append(divDCBottom24, divDataIcon24);
						append(divDCBottom24, divDataLeft24);
						append(divDCBottom24, divDataRight24);
						append(divDataContainerBottom, divDCBottom1);
						append(divDataContainerBottom, divDCBottom24);
						append(divData, divDataContainerBottom);
						append(result, divData);
						return result;
					},
					displayRainDrops: function (module) {

						let datatype = NetatmoDataType.RAIN;
						let result = el("div", "displayRainDrops");

						let divData = el("div", datatype);
						append(divData, el("div", "xlarge wi wi-raindrops"));
						append(result, divData);

						return result;
					},
					displayWind: function (module) {
						var result = el("div", "displayWind");
						let datatype = NetatmoDataType.WIND_STRENGTH;
						let value = this.getValue(module, datatype, true, false);
						let valueGustAngle = this.getValue(module, NetatmoDataType.GUST_ANGLE, true, false);
						let valueGustStrength = this.getValue(module, NetatmoDataType.GUST_STRENGTH, true, false);
						let valueMaxAngle = this.getValue(module, NetatmoDataType.WIND_ANGLE_MAX, true, false);
						let valueMaxStrength = this.getValue(module, NetatmoDataType.WIND_STRENGTH_MAX, true, false);

						// MAIN Data
						let divData = el("div", datatype);
						let divDataContainer = el("div", "data_container");
						let divDataLeft = el("div", "data_left large light bright");
						append(divDataLeft, formatter.value(datatype, value));
						let divDataRight = el("div", "data_right");
						let divDataRightUp = el("div", "small light bright data_right_up");
						append(divDataRightUp, this.getUnit(datatype));
						append(divDataRight, divDataRightUp);
						append(divDataRight, el("div", cls("medium light bright data_right_down", formatter.icon(NetatmoDataType.WIND_STRENGTH, value))));

						append(divDataContainer, divDataLeft);
						append(divDataContainer, divDataRight);
						append(divData, divDataContainer);

						// DATA GUST and MAX
						let divDataContainerBottom = el("div", "data_container_align");
						let divDCBottomGust = el("div", "data_container");
						let divDCBottomMax = el("div", "data_container");
						let divDataIconGust = el("div", cls("data_icon small light dimmed", formatter.icon(NetatmoDataType.GUST_ANGLE, valueGustAngle)));
						let divDataIconMax = el("div", cls("data_icon small light dimmed", formatter.icon(NetatmoDataType.WIND_ANGLE_MAX, valueMaxAngle)));
						let divDataLeftGust = el("div", "data_left small");
						append(divDataLeftGust, " " + formatter.value(NetatmoDataType.GUST_STRENGTH, valueGustStrength));
						let divDataRightGust = el("div", cls("data_right"));
						append(divDataRightGust, el("div", cls("small light data_right_up", formatter.icon(NetatmoDataType.GUST_STRENGTH, valueGustStrength))));
						let divDataLeftMax = el("div", "data_left small");
						append(divDataLeftMax, " " + formatter.value(NetatmoDataType.WIND_STRENGTH_MAX, valueMaxStrength));
						let divDataRightMax = el("div", "data_right");
						append(divDataRightMax, el("div", cls("small light data_right_up", formatter.icon(NetatmoDataType.WIND_STRENGTH_MAX, valueMaxStrength))));
						append(divDCBottomGust, divDataIconGust);
						append(divDCBottomGust, divDataLeftGust);
						append(divDCBottomGust, divDataRightGust);
						append(divDCBottomMax, divDataIconMax);
						append(divDCBottomMax, divDataLeftMax);
						append(divDCBottomMax, divDataRightMax);
						append(divDataContainerBottom, divDCBottomGust);
						append(divDataContainerBottom, divDCBottomMax);
						append(divData, divDataContainerBottom);
						append(result, divData);
						return result;
					},
					displayWindAngle: function (module) {
						var result = el("div", "displayWindAngle");
						let datatype = NetatmoDataType.WIND_ANGLE;
						let value = this.getValue(module, datatype, true, false);
						let icon = formatter.icon(datatype, value);

						let divData = el("div", datatype);
						append(divData, el("div", cls("x-medium", icon)));
						let divValue = el("div", "small value");
						append(divValue, translator.bind(that)(formatter.deg2Cardinal(value).toUpperCase()) + " | " + value + this.getUnit(datatype));
						append(divData, divValue);
						append(result, divData);
						return result;
					},
					displayData: function (module, datatype, isDashboardData) {
						let displayclass = "display" + datatype;
						let result = el("div", displayclass);
						let value = this.getValue(module, datatype, isDashboardData, false);
						let dataIcon = formatter.icon(datatype, value);
						const statusCircle = "fa fa-circle fa-xs";
						let statusClass = "";
						let statusIcon = "";
						let trendIcon = "";
						let valueTrend = "";

						switch (datatype) {
							case NetatmoDataType.BATTERY:
							case NetatmoDataType.HUMIDITY:
							case NetatmoDataType.NOISE:
							case NetatmoDataType.WIFI:
							case NetatmoDataType.RADIO:
								statusIcon = statusCircle;
								statusClass = formatter.status(datatype, value);
								break;
							case NetatmoDataType.PRESSURE:
								valueTrend = this.getValue(module, NetatmoDataType.PRESSURE_TREND, true, false);
								trendIcon = formatter.icon(NetatmoDataType.PRESSURE_TREND, valueTrend);
								break;
							case NetatmoDataType.TEMPERATURE:
								valueTrend = this.getValue(module, NetatmoDataType.TEMP_TREND, true, false);
								trendIcon = formatter.icon(NetatmoDataType.PRESSURE_TREND, valueTrend);
								break;
							case NetatmoDataType.WIND_STRENGTH:
								let valueAngle = this.getValue(module, NetatmoDataType.WIND_ANGLE, true, false);
								dataIcon = formatter.icon(NetatmoDataType.WIND_ANGLE, valueAngle);
							default:
								break;
						}

						let divData = el("div", datatype);
						// translations can carry markup (e.g. CO2 -> "CO<sub>2</sub>"), so this
						// goes through appendMarkup like jQuery's .append(string) always did --
						// safe here because the content is developer-authored translation text,
						// never Netatmo/aqicn-sourced.
						let divDataHeader = el("div", "xxsmall dimmed");
						appendMarkup(divDataHeader, translator.bind(that)(datatype.toUpperCase()).toUpperCase());
						let divDataIcon = el("div", cls("data_icon xsmall light dimmed", dataIcon));
						let divDataContainer = el("div", "data_container");
						let divDataLeft = el("div", "data_left small light bright");
						append(divDataLeft, formatter.value(datatype, value));
						let divDataRight = el("div", "data_right");
						let divDataRightUp = el("div", "xxsmall light bright data_right_up");
						append(divDataRightUp, this.getUnit(datatype));
						append(divDataRight, divDataRightUp);

						if (statusIcon !== "") { append(divDataRight, el("div", cls("xxsmall light bright data_right_down_status", statusIcon, statusClass))); }
						if (trendIcon !== "") { append(divDataRight, el("div", cls("xsmall light bright data_right_down", trendIcon))); }
						if (that.config.showDataIcon) { append(divDataContainer, divDataIcon); }
						if (that.config.showDataHeader) { append(divData, divDataHeader); }
						append(divDataContainer, divDataLeft);
						append(divDataContainer, divDataRight);
						append(divData, divDataContainer);
						append(result, divData);

						return result;
					},
					aqiColorClass: {
						UNDEFINED: "textgray",
						AQI_GOOD: "textgreen",
						AQI_MODERATE: "textyellow",
						AQI_UNHEALTHY_SENSITIVE: "textorange",
						AQI_UNHEALTHY: "textred",
						AQI_VERY_UNHEALTHY: "textpurple",
						AQI_HAZARDOUS: "textdeepred"
					},
					// Same 6 colors as aqiColorClass's .textXXX rules in MMM-netatmo.css, in
					// AQI-ascending order -- duplicated here because SVG gradient stops need
					// literal color values, not CSS classes.
					aqiGaugeGradientColors: ["#32cd32", "#cacd32", "#ffa500", "#ff0000", "#361b80", "#6e0202"],
					co2ColorClass: { good: "textgreen", average: "textorange", bad: "textred" },
					co2GaugeLabelKey: { good: "CO2_GOOD", average: "CO2_AVERAGE", bad: "CO2_BAD" },
					// Same 3 colors as co2ColorClass's .textXXX rules, in ascending order.
					co2GaugeGradientColors: ["#32cd32", "#ffa500", "#ff0000"],
					// A gauge that fills from left to right and sweeps through `gradientColors`
					// as the value rises, https://helpcenter.netatmo.com/hc/en-us/articles/17069028550930.
					// `idSuffix` need only be unique per gauge on the page (see call sites).
					buildGauge: function (angle, gradientColors, idSuffix) {
						var cx = 100, cy = 105, r = 85, strokeWidth = 16;
						var svg = svgEl("svg", { "class": "gauge", viewBox: "0 0 200 120" });

						// Scoped to this module instance's identifier so multiple MMM-Netatmo
						// instances on one page (each with their own gauges) don't collide on the id.
						var gradientId = "gaugeGradient-" + idSuffix + "-" + that.identifier;
						var gradient = svgEl("linearGradient", {
							id: gradientId,
							gradientUnits: "userSpaceOnUse",
							x1: cx - r, y1: cy, x2: cx + r, y2: cy
						});
						gradientColors.forEach(function (color, i) {
							append(gradient, svgEl("stop", {
								offset: (i / (gradientColors.length - 1) * 100) + "%",
								"stop-color": color
							}));
						});
						var defs = svgEl("defs");
						append(defs, gradient);
						append(svg, defs);

						// Full-width dim track, always visible, so the ungauged remainder still reads as a gauge.
						append(svg, svgEl("path", {
							"class": "gaugeTrack",
							d: gaugeArcPath(cx, cy, r, 0, 180),
							fill: "none",
							"stroke-width": strokeWidth,
							"stroke-linecap": "round"
						}));

						// Filled portion, clipped to the current value's position on the same
						// fixed (userSpaceOnUse) gradient, so only the colors up to that point show.
						if (angle > 0) {
							append(svg, svgEl("path", {
								"class": "gaugeFill",
								d: gaugeArcPath(cx, cy, r, 0, angle),
								fill: "none",
								stroke: "url(#" + gradientId + ")",
								"stroke-width": strokeWidth,
								"stroke-linecap": "round"
							}));
						}

						return svg;
					},
					// Builds the "<gauge><value/label centered in it>" block shared by the
					// AQI and CO2 displays.
					buildGaugeBlock: function (angle, gradientColors, idSuffix, value, label) {
						let gaugeWrap = el("div", "gaugeWrap");
						append(gaugeWrap, this.buildGauge(angle, gradientColors, idSuffix));
						let gaugeText = el("div", "gaugeText");
						let gaugeValue = el("div", "gaugeValue");
						append(gaugeValue, value);
						let gaugeLabel = el("div", "gaugeLabel");
						setText(gaugeLabel, label);
						append(gaugeText, gaugeValue);
						append(gaugeText, gaugeLabel);
						append(gaugeWrap, gaugeText);
						return gaugeWrap;
					},
					displayAQI: function (module) {
						let result = el("div", "displayAQI");
						var category = formatter.aqiCategory(AirQualityValue);
						var statusAirQuality = this.aqiColorClass[category];

						let divAQI = el("div", cls("AQI", statusAirQuality));
						let angle = formatter.aqiGaugeAngle(AirQualityValue);
						append(divAQI, this.buildGaugeBlock(angle, this.aqiGaugeGradientColors, "aqi", AirQualityValue, AirQualityImpact));

						if (AirQualityPollutant) {
							let divPollutant = el("div", "aqiPollutant");
							append(divPollutant, translator.bind(that)("AQI_POLLUTANT") + ": " + AirQualityPollutant);
							append(divAQI, divPollutant);
						}

						append(result, divAQI);
						return result;
					},
				};
			})(formatter, translator, that) // end of the bubbles design
		}[design];
	},

	getScripts: function () {
		//	      Log.log("Netatmo : getScripts");
		return [
			"formatter.js",
			"moment.js"
		];
	},
	getStyles: function () {
		// Log.log("Netatmo : getStyles");
		return ["MMM-netatmo.css", "font-awesome.css", "weather-icons.css", "weather-icons-wind.css"];
	},

	getTranslations: function () {
		//Log.log("Netatmo : getTranslations");
		return {
			cs: "translations/cs.json",
			de: "translations/de.json",
			en: "translations/en.json",
			fr: "translations/fr.json",
			nb: "translations/nb.json",
			nl: "translations/nl.json",
			nn: "translations/nn.json"
		};
	},

	getDom: function () {

		Log.log("MMM-Netatmo : getDom");
		var dom = el("div", cls("MMM-netatmo", this.config.design));
		if (this.dom) {
			append(dom, this.dom);
			let updated = el("div", "updated xsmall");
			append(updated, moment(new Date(1000 * this.lastUpdate)).fromNow());
			append(dom, updated);
			if (!this.config.hideLoadTimer) {
				append(dom, parseMarkup(
					"<svg class=\"loadTimer\" viewbox=\"0 0 250 250\">" +
					"  <path class=\"border\" transform=\"translate(125, 125)\"/>" +
					"  <path class=\"loader\" transform=\"translate(125, 125) scale(.84)\"/>" +
					"</svg>"
				));
			}

		} else {
			append(dom, parseMarkup(
				"<svg class=\"loading\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 100 100\" preserveAspectRatio=\"xMidYMid\">" +
				"  <circle class=\"outer\"></circle>" +
				"  <circle class=\"inner\">" +
				"    <animate attributeName=\"stroke-dashoffset\" dur=\"5s\" repeatCount=\"indefinite\" from=\"0\" to=\"502\"></animate>" +
				"    <animate attributeName=\"stroke-dasharray\" dur=\"5s\" repeatCount=\"indefinite\" values=\"150.6 100.4;1 250;150.6 100.4\"></animate>" +
				"  </circle>" +
				"</svg>"
			));
		}
		return dom;
	}
});
