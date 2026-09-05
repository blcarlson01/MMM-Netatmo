/* Magic Mirror Node Helper: Netatmo
 * Performs the OAuth token refresh, the getstationsdata request, and the
 * aqicn.org outdoor air-quality lookup server-side, so clientSecret/refreshToken/
 * access_token/aqicnToken never enter the renderer process.
 */

const NodeHelper = require("node_helper");

const AQICN_BASE = "https://api.waqi.info/feed/";

module.exports = NodeHelper.create({
	socketNotificationReceived: function (notification, payload) {
		if (notification === "NETATMO_FETCH_DATA") {
			this.fetchStationData(payload);
		} else if (notification === "NETATMO_FETCH_AQI") {
			this.fetchAirQuality(payload);
		}
	},

	fetchStationData: async function (payload) {
		const { identifier, api, clientId, clientSecret, refreshToken } = payload;
		try {
			const tokenResponse = await fetch(api.base + api.authEndpoint, {
				method: "POST",
				headers: { "Content-Type": "application/x-www-form-urlencoded" },
				body: new URLSearchParams({
					grant_type: "refresh_token",
					refresh_token: refreshToken,
					client_id: clientId,
					client_secret: clientSecret
				}).toString()
			});
			if (!tokenResponse.ok) {
				throw new Error("Netatmo token request failed with status " + tokenResponse.status);
			}
			const tokenData = await tokenResponse.json();

			const dataResponse = await fetch(
				api.base + api.dataEndpoint + "?" + new URLSearchParams({ access_token: tokenData.access_token }).toString()
			);
			if (!dataResponse.ok) {
				throw new Error("Netatmo getstationsdata request failed with status " + dataResponse.status);
			}
			const stationData = await dataResponse.json();

			this.sendSocketNotification("NETATMO_DATA", {
				identifier: identifier,
				data: stationData,
				refreshToken: tokenData.refresh_token
			});
		} catch (error) {
			this.sendSocketNotification("NETATMO_ERROR", {
				identifier: identifier,
				error: error.message
			});
		}
	},

	// city is a trusted config value (e.g. "germany/berlin"), inserted as-is to
	// match aqicn.org's multi-segment feed path convention.
	fetchAirQuality: async function (payload) {
		const { identifier, city, token } = payload;
		try {
			const response = await fetch(
				AQICN_BASE + city + "/?" + new URLSearchParams({ token: token }).toString()
			);
			if (!response.ok) {
				throw new Error("aqicn.org feed request failed with status " + response.status);
			}
			const result = await response.json();
			if (result.status !== "ok") {
				throw new Error("aqicn.org feed returned status \"" + result.status + "\"");
			}

			this.sendSocketNotification("NETATMO_AQI_DATA", {
				identifier: identifier,
				aqi: result.data.aqi,
				dominantPollutant: result.data.dominentpol
			});
		} catch (error) {
			this.sendSocketNotification("NETATMO_AQI_ERROR", {
				identifier: identifier,
				error: error.message
			});
		}
	}
});
