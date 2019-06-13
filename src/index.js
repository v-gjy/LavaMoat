const fs = require('fs')
const mergeDeep = require('merge-deep')
const generatePrelude = require('./generatePrelude')
const createCustomPack = require('../lib/browser-pack')
const { createConfigSpy } = require('./generateConfig')
const createPackageNameStream = require('./packageName')
const { wrapIntoBundle } = require('./sourcemaps')

/*  export a Browserify plugin  */
module.exports = function (browserify, pluginOpts) {
  // setup the plugin in a re-bundle friendly way
  browserify.on('reset', setupPlugin)
  setupPlugin()

  // override browserify/browser-pack prelude
  function setupPlugin () {
    // helper to read config at path
    if (typeof pluginOpts.config === 'string') {
      pluginOpts.sesifyConfig = () => {
        // load latest config
        const filename = pluginOpts.config
        const configSource = fs.readFileSync(filename, 'utf8')
        // if override specified, merge
        if (pluginOpts.configOverride) {
          const filename = pluginOpts.configOverride
          const configOverrideSource = fs.readFileSync(filename, 'utf8')
          const initialConfig = JSON.parse(configSource)
          const overrideConfig = JSON.parse(configOverrideSource)
          const config = mergeDeep(initialConfig, overrideConfig)
          return config
        }
        return configSource
      }
    }

    const customPack = createSesifyPacker(pluginOpts)
    // replace the standard browser-pack with our custom packer
    browserify.pipeline.splice('pack', 1, customPack)

    // inject package name into module data
    browserify.pipeline.splice('emit-deps', 0, createPackageNameStream())

    // quick globalRef detect hack
    browserify.pipeline.splice('emit-deps', 0, require('through2').obj((module,_,cb) => {
      module.source = module.source
        .split(`Function('return this')()`)
        .join(`(global || self || window)`)
        cb(null, module)
    }))

    // helper to dump autoconfig to a file
    if (pluginOpts.writeAutoConfig) {
      const filename = pluginOpts.writeAutoConfig
      pluginOpts.autoConfig = function writeAutoConfig (config) {
        fs.writeFileSync(filename, config)
        console.warn(`Sesify Autoconfig - wrote to "${filename}"`)
      }
    }
    // if autoconfig activated, insert hook
    if (pluginOpts.autoConfig) {
      browserify.pipeline.splice('emit-deps', 0, createConfigSpy({
        onResult: pluginOpts.autoConfig
      }))
    }
  }
}

module.exports.generatePrelude = generatePrelude
module.exports.createSesifyPacker = createSesifyPacker

function createSesifyPacker (opts) {
  const onSourcemap = opts.onSourcemap || (row => row.sourceFile)
  const defaults = {
    raw: true,
    prelude: generatePrelude(opts),
    generateModuleInitializer: (row) => {
      const wrappedBundle = wrapIntoBundle(row.source)
      const sourceMappingURL = onSourcemap(row, wrappedBundle)
      // for now, ignore new sourcemap and just append original filename
      let moduleInitSrc = wrappedBundle.code
      if (sourceMappingURL) moduleInitSrc += `\n//# sourceMappingURL=${sourceMappingURL}`
      return escapeCodeAsString(moduleInitSrc)
    }
  }

  const packOpts = Object.assign({}, defaults, opts)
  const customPack = createCustomPack(packOpts)
  return customPack
}

function escapeCodeAsString (source) {
  const escapedSource = source
    .split('\\').join('\\\\')
    .split('$').join('\\$')
    .split('`').join('\\`')
  return `\`${escapedSource}\``
}
