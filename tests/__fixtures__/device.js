// A representative getstationsdata devices[0] payload covering every module type,
// shaped like the real API responses documented in DATA.md.
const NOW = 1735689600; // fixed timestamp so snapshots don't churn day to day

function buildDevice() {
	return {
		_id: "70:ee:50:00:00:01",
		type: "NAMain",
		module_name: "Living Room",
		station_name: "Home",
		wifi_status: 56,
		firmware: 174,
		reachable: true,
		co2_calibrating: false,
		dashboard_data: {
			time_utc: NOW,
			AbsolutePressure: 1013.2,
			Noise: 38,
			Temperature: 21.4,
			temp_trend: "stable",
			Humidity: 45,
			Pressure: 1013.6,
			pressure_trend: "up",
			CO2: 612,
			min_temp: 19.8,
			max_temp: 22.1
		},
		modules: [
			{
				_id: "02:00:00:00:00:01",
				type: "NAModule1", // outdoor
				module_name: "Outdoor",
				battery_percent: 82,
				rf_status: 62,
				firmware: 51,
				reachable: true,
				last_message: NOW,
				dashboard_data: {
					time_utc: NOW,
					Temperature: 14.2,
					temp_trend: "down",
					Humidity: 63,
					min_temp: 12.1,
					max_temp: 16.4
				}
			},
			{
				_id: "03:00:00:00:00:01",
				type: "NAModule4", // indoor
				module_name: "Kitchen",
				battery_percent: 90,
				rf_status: 55,
				firmware: 51,
				reachable: true,
				last_message: NOW,
				dashboard_data: {
					time_utc: NOW,
					Temperature: 20.1,
					temp_trend: "stable",
					Humidity: 40,
					CO2: 480,
					min_temp: 18.9,
					max_temp: 21.0
				}
			},
			{
				_id: "05:00:00:00:00:01",
				type: "NAModule3", // rain
				module_name: "Rain",
				battery_percent: 75,
				rf_status: 68,
				firmware: 12,
				reachable: true,
				last_message: NOW,
				dashboard_data: {
					time_utc: NOW,
					Rain: 0.4,
					sum_rain_1: 0.4,
					sum_rain_24: 3.2
				}
			},
			{
				_id: "06:00:00:00:00:01",
				type: "NAModule2", // wind
				module_name: "Wind",
				battery_percent: 60,
				rf_status: 71,
				firmware: 19,
				reachable: true,
				last_message: NOW,
				dashboard_data: {
					time_utc: NOW,
					WindStrength: 12,
					WindAngle: 180,
					GustStrength: 22,
					GustAngle: 200,
					max_wind_str: 30,
					max_wind_angle: 190
				}
			}
		]
	};
}

module.exports = { buildDevice, NOW };
