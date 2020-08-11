#!/bin/env node
/**
 * Build plugins specified by globs
 */
process.env.PATH = `./node_modules/.bin:${process.env.PATH}`;

const rimraf = require('rimraf');
const { spawnSync } = require('child_process');
const fastGlob = require('fast-glob');
const { argv } = require('yargs')
  .option('lint', {
    describe: 'whether to run ESLint',
    type: 'boolean',
    // lint is slow, so not turning it on by default
    default: false,
  })
  .option('babel', {
    describe: 'Whether to run Babel',
    type: 'boolean',
    default: true,
  })
  .option('clean', {
    describe: 'Whether to clean cache',
    type: 'boolean',
    default: true,
  })
  .option('type', {
    describe: 'Whether to run tsc',
    type: 'boolean',
    default: true,
  });

const {
  _: globs,
  lint: shouldLint,
  babel: shouldRunBabel,
  clean: shouldCleanup,
  type: shouldRunTyping,
} = argv;
const glob = globs.length > 1 ? `{${globs.join(',')}}` : globs[0] || '*';

const BABEL_CONFIG = '--config-file=../../babel.config.js';

// packages that do not need tsc
const META_PACKAGES = new Set(['demo', 'generator-superset']);

function run(cmd) {
  console.log(`\n>> ${cmd}\n`);
  const [p, ...args] = cmd.split(' ');
  const runner = spawnSync;
  const { status } = runner(p, args, { stdio: 'inherit' });
  if (status !== 0) {
    process.exit(status);
  }
}

function getPackages(pattern, tsOnly = false) {
  if (pattern === '*' && !tsOnly) {
    return `@superset-ui/!(${[...META_PACKAGES].join('|')})`;
  }
  const packages = [
    ...new Set(
      fastGlob
        .sync([
          `./node_modules/@superset-ui/${pattern}/src/**/*.${
            tsOnly ? '{ts,tsx}' : '{ts,tsx,js,jsx}'
          }`,
        ])
        .map(x => x.split('/')[3])
        .filter(x => !META_PACKAGES.has(x)),
    ),
  ];
  if (packages.length === 0) {
    throw new Error('No matching packages');
  }
  return `@superset-ui/${packages.length > 1 ? `{${packages.join(',')}}` : packages[0]}`;
}

let scope = getPackages(glob);

if (shouldLint) {
  run(`nimbus eslint {packages,plugins}/${scope}/{src,test}`);
}

if (shouldCleanup) {
  const cachePath = `./node_modules/${scope}/{lib,esm,tsconfig.tsbuildinfo,node_modules/@types/react}`;
  console.log(`\n>> Cleaning up ${cachePath}`);
  rimraf.sync(cachePath);
}

if (shouldRunBabel) {
  run(`lerna exec --stream --concurrency 10 --scope ${scope}
         -- babel ${BABEL_CONFIG} src --extensions ".ts,.tsx,.js,.jsx" --out-dir lib --copy-files`);
}

if (shouldRunTyping) {
  // only run tsc for packages with ts files
  scope = getPackages(glob, true);
  run(`lerna exec --stream --concurrency 3 --scope ${scope} \
       -- tsc --build`);
}
