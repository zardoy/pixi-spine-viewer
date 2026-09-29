// Legacy-format config kept for editors/tooling that still read it; this repo lints via the flat
// config at the root. The rule that matters is the import allowlist — see eslint.config.js.
module.exports = {
	root: true,
	rules: {
		'no-restricted-imports': [
			'error',
			{
				patterns: [
					{
						group: ['@/*', '$lib/*', '$app/*'],
						message:
							'Vendored package: no host-project imports. Everything project-specific must be supplied via props or config.',
					},
				],
			},
		],
	},
};
