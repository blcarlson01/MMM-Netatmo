/**
 * @jest-environment jsdom
 *
 * Characterization tests for the "bubbles" render tree. These snapshot the
 * rendered HTML for representative configs/devices. They were first captured
 * against the original jQuery-based implementation, then re-run unchanged
 * after the vanilla-DOM rewrite (see git history) to prove the rendered
 * output didn't change.
 */
const { createInstance } = require("./helpers/loadModule");
const { buildDevice } = require("./__fixtures__/device");

// Works whether render() returns a jQuery object (old) or a raw DOM Node (new).
function toHTML(node) {
	return node && node.jquery ? node[0].outerHTML : node.outerHTML;
}

function renderWith(configOverrides) {
	const instance = createInstance(configOverrides);
	const device = buildDevice();
	const result = instance.getDesign("bubbles").render(device);
	return toHTML(result);
}

describe("bubbles render tree (characterization)", () => {
	test("default config, no moduleOrder set (regression test for the moduleOrder.length crash)", () => {
		expect(renderWith({})).toMatchSnapshot();
	});

	test("explicit moduleOrder, including an indoor module", () => {
		expect(renderWith({ moduleOrder: ["Living Room", "Wind", "Kitchen", "Rain"] })).toMatchSnapshot();
	});

	test("wind and rain folded into the outdoor module", () => {
		expect(renderWith({ displayWindInOutdoor: true, displayRainInOutdoor: true })).toMatchSnapshot();
	});

	test("imperial units with mph wind", () => {
		expect(renderWith({ units: "imperial", windUnit: "mph" })).toMatchSnapshot();
	});

	test("horizontal layout with overflow", () => {
		expect(renderWith({ horizontal: true, horizontalOverflow: true })).toMatchSnapshot();
	});

	test("status/icon/header toggles all off", () => {
		expect(renderWith({ showModuleStatus: false, showDataIcon: false, showDataHeader: false, showModuleFirmware: false })).toMatchSnapshot();
	});

	test("AQI display reflects the current air quality reading", () => {
		const instance = createInstance({});
		instance.renderAirQuality({ aqi: 87, dominantPollutant: "pm25" });
		const device = buildDevice();
		const result = instance.getDesign("bubbles").render(device);
		expect(toHTML(result)).toMatchSnapshot();
	});

	test("AQI display for a healthy (good) reading, including a real zero-adjacent value", () => {
		const instance = createInstance({});
		instance.renderAirQuality({ aqi: 12, dominantPollutant: "o3" });
		const device = buildDevice();
		const result = instance.getDesign("bubbles").render(device);
		expect(toHTML(result)).toMatchSnapshot();
	});
});

// The gauge's structure isn't obvious from a snapshot diff alone, so its geometry
// is asserted directly here rather than left to be inferred from opaque HTML.
// AQI and CO2 both use the same shared "fill gauge" (see buildGauge/buildGaugeBlock
// in MMM-Netatmo.js), so a single render can contain more than one -- tests scope
// their queries to .AQI/.CO2 to target a specific one.
describe("AQI gauge structure", () => {
	function renderAQI(aqi, dominantPollutant) {
		const NetatmoFormatter = require("../formatter.js");
		const instance = createInstance({});
		instance.renderAirQuality({ aqi, dominantPollutant });
		const device = buildDevice(); // fixture's NAModule1 ("Outdoor") is the AQI source
		const result = instance.getDesign("bubbles").render(device);
		const root = result instanceof Node ? result : result[0];
		return { root: root.querySelector(".AQI"), expectedAngle: NetatmoFormatter.aqiGaugeAngle(aqi) };
	}

	test("draws a full-width dim track plus a gradient fill, both starting from the same point", () => {
		const { root } = renderAQI(75);
		const track = root.querySelector(".gauge .gaugeTrack");
		const fill = root.querySelector(".gauge .gaugeFill");
		expect(track).not.toBeNull();
		expect(fill).not.toBeNull();
		expect(fill.getAttribute("stroke")).toMatch(/^url\(#gaugeGradient-aqi-/);
		// Both arcs start at the same point (gauge angle 0); only where they end differs.
		expect(fill.getAttribute("d").split(" A")[0]).toBe(track.getAttribute("d").split(" A")[0]);
	});

	test("the track is identical regardless of the AQI value (only the fill changes)", () => {
		const low = renderAQI(0);
		const high = renderAQI(300);
		const trackLow = low.root.querySelector(".gaugeTrack").getAttribute("d");
		const trackHigh = high.root.querySelector(".gaugeTrack").getAttribute("d");
		expect(trackLow).toBe(trackHigh);
	});

	test("the fill grows as the AQI value rises", () => {
		const lower = renderAQI(50);
		const higher = renderAQI(150);
		const fillLower = lower.root.querySelector(".gaugeFill").getAttribute("d");
		const fillHigher = higher.root.querySelector(".gaugeFill").getAttribute("d");
		expect(fillLower).not.toBe(fillHigher);
	});

	test("the fill exactly matches the full track once the value reaches the top of the scale", () => {
		const { root } = renderAQI(400);
		const track = root.querySelector(".gaugeTrack").getAttribute("d");
		const fill = root.querySelector(".gaugeFill").getAttribute("d");
		expect(fill).toBe(track);
	});

	test("has no needle -- this is a fill gauge, not a pointer gauge", () => {
		const { root } = renderAQI(75);
		expect(root.querySelector(".aqiNeedle")).toBeNull();
		expect(root.querySelector(".aqiNeedleHub")).toBeNull();
	});

	test("defines a 6-stop gradient in AQI-ascending color order", () => {
		const { root } = renderAQI(75);
		const stops = root.querySelectorAll(".gauge linearGradient stop");
		expect(Array.from(stops).map((s) => s.getAttribute("stop-color"))).toEqual([
			"#32cd32", "#cacd32", "#ffa500", "#ff0000", "#361b80", "#6e0202"
		]);
	});

	test("omits the fill arc entirely at AQI 0 instead of drawing a zero-length path", () => {
		const { root } = renderAQI(0);
		expect(root.querySelector(".gaugeFill")).toBeNull();
	});

	test("clamps at the top of the scale for values beyond it, same as an exact match", () => {
		const track = renderAQI(400).root.querySelector(".gaugeTrack").getAttribute("d");
		const fillAtCap = renderAQI(400).root.querySelector(".gaugeFill").getAttribute("d");
		const fillBeyondCap = renderAQI(500).root.querySelector(".gaugeFill").getAttribute("d");
		expect(fillBeyondCap).toBe(fillAtCap);
		expect(fillBeyondCap).toBe(track);
	});

	test.each([
		[12, "AQI_GOOD"],
		[75, "AQI_MODERATE"],
		[125, "AQI_UNHEALTHY_SENSITIVE"],
		[175, "AQI_UNHEALTHY"],
		[250, "AQI_VERY_UNHEALTHY"],
		[350, "AQI_HAZARDOUS"]
	])("AQI %d resolves to category %s", (aqi, category) => {
		const NetatmoFormatter = require("../formatter.js");
		expect(NetatmoFormatter.aqiCategory(aqi)).toBe(category);
	});

	test("shows the dominant pollutant when one is provided", () => {
		const { root } = renderAQI(87, "pm25");
		const pollutant = root.querySelector(".aqiPollutant");
		expect(pollutant.textContent).toBe("AQI_POLLUTANT: PM2.5");
	});

	test("omits the pollutant line entirely when none is provided", () => {
		const { root } = renderAQI(87, undefined);
		expect(root.querySelector(".aqiPollutant")).toBeNull();
	});

	test("shows the numeric value and translated category label centered in the gauge", () => {
		const { root } = renderAQI(12, "o3");
		expect(root.querySelector(".gaugeValue").textContent).toBe("12");
		expect(root.querySelector(".gaugeLabel").textContent).toBe("AQI_GOOD");
		expect(root.className).toContain("textgreen");
	});
});

describe("CO2 gauge structure", () => {
	// buildDevice()'s NAMain ("Living Room") reports CO2: 612 by default.
	function renderCO2(co2) {
		const NetatmoFormatter = require("../formatter.js");
		const instance = createInstance({});
		const device = buildDevice();
		device.dashboard_data.CO2 = co2;
		const result = instance.getDesign("bubbles").render(device);
		const root = result instanceof Node ? result : result[0];
		return { root: root.querySelector(".CO2"), expectedAngle: NetatmoFormatter.co2GaugeAngle(co2) };
	}

	test("draws a full-width dim track plus a gradient fill, both starting from the same point", () => {
		const { root } = renderCO2(1000);
		const track = root.querySelector(".gauge .gaugeTrack");
		const fill = root.querySelector(".gauge .gaugeFill");
		expect(track).not.toBeNull();
		expect(fill).not.toBeNull();
		expect(fill.getAttribute("stroke")).toMatch(/^url\(#gaugeGradient-co2-/);
	});

	test("defines a 3-stop gradient in ascending good/average/bad color order", () => {
		const { root } = renderCO2(1000);
		const stops = root.querySelectorAll(".gauge linearGradient stop");
		expect(Array.from(stops).map((s) => s.getAttribute("stop-color"))).toEqual([
			"#32cd32", "#ffa500", "#ff0000"
		]);
	});

	test.each([
		[400, "textgreen", "CO2_GOOD"],
		[1200, "textorange", "CO2_AVERAGE"],
		[2000, "textred", "CO2_BAD"]
	])("CO2 %dppm shows the %s status and label", (co2, colorClass, labelKey) => {
		const { root } = renderCO2(co2);
		expect(root.className).toContain(colorClass);
		expect(root.querySelector(".gaugeLabel").textContent).toBe(labelKey);
		expect(root.querySelector(".gaugeValue").textContent).toBe(String(co2) + "PPM");
	});

	test("fills further for a higher CO2 reading", () => {
		const lower = renderCO2(500);
		const higher = renderCO2(2000);
		const fillLower = lower.root.querySelector(".gaugeFill").getAttribute("d");
		const fillHigher = higher.root.querySelector(".gaugeFill").getAttribute("d");
		expect(fillLower).not.toBe(fillHigher);
	});

	test("AQI and CO2 gauges on the same page get distinct gradient ids", () => {
		const instance = createInstance({});
		instance.renderAirQuality({ aqi: 60, dominantPollutant: "pm25" });
		const device = buildDevice();
		const result = instance.getDesign("bubbles").render(device);
		const root = result instanceof Node ? result : result[0];
		const aqiFillId = root.querySelector(".AQI .gaugeFill").getAttribute("stroke");
		const co2FillId = root.querySelector(".CO2 .gaugeFill").getAttribute("stroke");
		expect(aqiFillId).not.toBe(co2FillId);
	});
});
