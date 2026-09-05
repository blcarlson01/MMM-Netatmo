module.exports = {
	testEnvironment: "node",
	testMatch: ["<rootDir>/tests/**/*.test.js"],
	testPathIgnorePatterns: ["/node_modules/"],
	collectCoverageFrom: ["formatter.js", "node_helper.js", "MMM-Netatmo.js"],
	coverageDirectory: "coverage"
};
