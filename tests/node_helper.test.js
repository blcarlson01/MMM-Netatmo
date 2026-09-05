// The real MagicMirror "node_helper" base class only resolves inside a MagicMirror
// install (via its module loader's NODE_PATH), so it's virtually mocked here with
// just enough surface -- create() merging overrides onto a spy-able sendSocketNotification.
jest.mock("node_helper", () => ({
	create: (overrides) => Object.assign({ sendSocketNotification: jest.fn() }, overrides)
}), { virtual: true });

const helper = require("../node_helper.js");

function jsonResponse(status, body) {
	return { ok: status >= 200 && status < 300, status, json: async () => body };
}

beforeEach(() => {
	helper.sendSocketNotification.mockClear();
	global.fetch = jest.fn();
});

describe("socketNotificationReceived routing", () => {
	test("routes NETATMO_FETCH_DATA to fetchStationData", () => {
		const spy = jest.spyOn(helper, "fetchStationData").mockImplementation(() => {});
		helper.socketNotificationReceived("NETATMO_FETCH_DATA", { identifier: "x" });
		expect(spy).toHaveBeenCalledWith({ identifier: "x" });
		spy.mockRestore();
	});

	test("routes NETATMO_FETCH_AQI to fetchAirQuality", () => {
		const spy = jest.spyOn(helper, "fetchAirQuality").mockImplementation(() => {});
		helper.socketNotificationReceived("NETATMO_FETCH_AQI", { identifier: "x" });
		expect(spy).toHaveBeenCalledWith({ identifier: "x" });
		spy.mockRestore();
	});

	test("ignores unknown notifications instead of throwing", () => {
		expect(() => helper.socketNotificationReceived("SOMETHING_ELSE", {})).not.toThrow();
	});
});

const api = { base: "https://api.netatmo.com/", authEndpoint: "oauth2/token", dataEndpoint: "api/getstationsdata" };

describe("fetchStationData", () => {
	test("exchanges the refresh token, fetches station data, and sends the rotated token back", async () => {
		global.fetch
			.mockResolvedValueOnce(jsonResponse(200, { access_token: "at", refresh_token: "rt2" }))
			.mockResolvedValueOnce(jsonResponse(200, { body: { devices: [{}] }, status: "ok" }));

		await helper.fetchStationData({
			identifier: "instance-1",
			api,
			clientId: "id",
			clientSecret: "secret",
			refreshToken: "rt1"
		});

		expect(global.fetch).toHaveBeenNthCalledWith(1, api.base + api.authEndpoint, expect.objectContaining({ method: "POST" }));
		const tokenBody = global.fetch.mock.calls[0][1].body;
		expect(tokenBody).toContain("grant_type=refresh_token");
		expect(tokenBody).toContain("refresh_token=rt1");
		expect(tokenBody).toContain("client_secret=secret");

		expect(global.fetch.mock.calls[1][0]).toContain(api.base + api.dataEndpoint);
		expect(global.fetch.mock.calls[1][0]).toContain("access_token=at");

		expect(helper.sendSocketNotification).toHaveBeenCalledWith("NETATMO_DATA", {
			identifier: "instance-1",
			data: { body: { devices: [{}] }, status: "ok" },
			refreshToken: "rt2"
		});
	});

	test("reports NETATMO_ERROR without throwing when the token request fails", async () => {
		global.fetch.mockResolvedValueOnce(jsonResponse(401, { error: "invalid_grant" }));

		await helper.fetchStationData({ identifier: "i", api, clientId: "id", clientSecret: "s", refreshToken: "bad" });

		expect(helper.sendSocketNotification).toHaveBeenCalledWith("NETATMO_ERROR", {
			identifier: "i",
			error: expect.stringContaining("401")
		});
	});

	test("reports NETATMO_ERROR when the station-data request fails after a good token", async () => {
		global.fetch
			.mockResolvedValueOnce(jsonResponse(200, { access_token: "at", refresh_token: "rt2" }))
			.mockResolvedValueOnce(jsonResponse(500, {}));

		await helper.fetchStationData({ identifier: "i", api, clientId: "id", clientSecret: "s", refreshToken: "rt1" });

		expect(helper.sendSocketNotification).toHaveBeenCalledWith("NETATMO_ERROR", {
			identifier: "i",
			error: expect.stringContaining("500")
		});
	});

	test("propagates network-level failures (e.g. offline) as NETATMO_ERROR instead of crashing", async () => {
		global.fetch.mockRejectedValueOnce(new Error("getaddrinfo ENOTFOUND"));

		await helper.fetchStationData({ identifier: "i", api, clientId: "id", clientSecret: "s", refreshToken: "rt1" });

		expect(helper.sendSocketNotification).toHaveBeenCalledWith("NETATMO_ERROR", {
			identifier: "i",
			error: "getaddrinfo ENOTFOUND"
		});
	});
});

describe("fetchAirQuality", () => {
	test("sends aqi and dominant pollutant on success", async () => {
		global.fetch.mockResolvedValueOnce(jsonResponse(200, { status: "ok", data: { aqi: 87, dominentpol: "pm25" } }));

		await helper.fetchAirQuality({ identifier: "i", city: "germany/berlin", token: "tok" });

		expect(global.fetch.mock.calls[0][0]).toBe("https://api.waqi.info/feed/germany/berlin/?token=tok");
		expect(helper.sendSocketNotification).toHaveBeenCalledWith("NETATMO_AQI_DATA", {
			identifier: "i",
			aqi: 87,
			dominantPollutant: "pm25"
		});
	});

	test("reports NETATMO_AQI_ERROR when aqicn.org returns a non-ok status field", async () => {
		global.fetch.mockResolvedValueOnce(jsonResponse(200, { status: "error", data: "Invalid key" }));

		await helper.fetchAirQuality({ identifier: "i", city: "germany/berlin", token: "bad" });

		expect(helper.sendSocketNotification).toHaveBeenCalledWith("NETATMO_AQI_ERROR", {
			identifier: "i",
			error: expect.stringContaining("error")
		});
	});

	test("reports NETATMO_AQI_ERROR on HTTP failure instead of crashing", async () => {
		global.fetch.mockResolvedValueOnce(jsonResponse(500, {}));

		await helper.fetchAirQuality({ identifier: "i", city: "germany/berlin", token: "tok" });

		expect(helper.sendSocketNotification).toHaveBeenCalledWith("NETATMO_AQI_ERROR", {
			identifier: "i",
			error: expect.stringContaining("500")
		});
	});
});
