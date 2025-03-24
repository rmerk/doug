const esbuild = require('esbuild');
const { existsSync, mkdirSync } = require('fs');
const { join } = require('path');

/**
 * A simple plugin that sends a message when the build starts and stops.
 * This enables the esbuild task problem matcher to work correctly.
 */
const esbuildProblemMatcherPlugin = {
	name: 'problem-matcher',
	setup(build) {
		build.onStart(() => {
			console.log('[build-started]');
		});

		build.onEnd(() => {
			console.log('[build-finished]');
		});
	},
};

/**
 * Ensure the dist directory exists
 */
const ensureDistDir = () => {
	const distDir = join(__dirname, 'dist');
	if (!existsSync(distDir)) {
		mkdirSync(distDir, { recursive: true });
	}
};

/**
 * Build options for esbuild
 */
const getBuildOptions = (production = false) => ({
	entryPoints: ['src/extension.ts'],
	bundle: true,
	external: ['vscode'],
	platform: 'node',
	outdir: 'dist',
	sourcemap: !production,
	minify: production,
	target: ['node16'],
	format: 'cjs',
	logLevel: 'info',
	plugins: [
		esbuildProblemMatcherPlugin,
	],
});

/**
 * Main build function
 */
const build = async () => {
	ensureDistDir();

	const args = process.argv.slice(2);
	const production = args.includes('--production');
	const watch = args.includes('--watch');

	const buildOptions = getBuildOptions(production);

	try {
		if (watch) {
			// Watch mode
			const context = await esbuild.context(buildOptions);
			await context.watch();
			console.log('Watching for changes...');
		} else {
			// Single build
			await esbuild.build(buildOptions);
			console.log(`Build completed in ${production ? 'production' : 'development'} mode`);
		}
	} catch (error) {
		console.error('Build failed:', error);
		process.exit(1);
	}
};

build();
