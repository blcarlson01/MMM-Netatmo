module.exports = function (grunt) {
	grunt.initConfig({
		eslint: {
			src: ["."],
			options: {
				format: "junit"
			}
		},
		jsonlint: {
			src: ["*.json", "translations/*.json"],
			options: {
				formatter: "prose",
				format: true,
				indent: 2
			}
		},
		yamllint: {
			src: [".github/workflows/*.yml"],
			options: {
				schema: "DEFAULT_SAFE_SCHEMA"
			}
		},
		stylelint: {
			src: ["MMM-netatmo.css"]
		}
	});

	grunt.loadNpmTasks("grunt-jsonlint");
	grunt.loadNpmTasks("grunt-stylelint");
	grunt.loadNpmTasks("grunt-yamllint");
	grunt.loadNpmTasks("gruntify-eslint");

	grunt.registerTask("default", ["test"]);
	grunt.registerTask("test", ["eslint", "jsonlint", "stylelint", "yamllint"]);
};
