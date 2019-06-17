const convertSourceMap = require('convert-source-map')
const offsetSourcemapLines = require('offset-sourcemap-lines')

module.exports = { wrapIntoModuleInitializer }

function wrapIntoModuleInitializer (source) {
  // extract sourcemaps
  const sourceMeta = extractSourceMaps(source)
  // create wrapper + update sourcemaps
  const newSourceMeta = transformToWrapped(sourceMeta)
  return newSourceMeta
}

function extractSourceMaps (sourceCode) {
  const converter = convertSourceMap.fromSource(sourceCode)
  // if (!converter) throw new Error('Unable to find original inlined sourcemap')
  const maps = converter && converter.toObject()
  const sourceContent = maps && maps.sourcesContent[0]
  const code = convertSourceMap.removeComments(sourceCode)
  return { code, maps }
}

function transformToWrapped (sourceMeta) {
  // create the wrapper around the module content
  // 1. create new global obj
  // 2. copy properties from actual endowments and global
  // see https://github.com/Agoric/SES/issues/123
  // 3. return a moduleInitializer fn
  const moduleWrapperSource =

`(${function () {
  const self = {}, window = self;
  try {
    Object.defineProperties(self, Object.getOwnPropertyDescriptors(_endowments));
    Object.defineProperties(self, Object.getOwnPropertyDescriptors(this));
  } catch (err) {
    console.warn(`Sesify - Error performing globalRef setup:`, err.message)
    throw err
  }
  return function (require,module,exports) {
    try {
__MODULE_CONTENT__
    } catch (err) {
      if (console) console.warn(err.stack || err.message)
      throw err
    }
  }
}}).call(this)`

  const [start, end] = moduleWrapperSource.split('__MODULE_CONTENT__')
  const offsetLinesCount = start.match(/\n/g).length
  const maps = sourceMeta.maps && offsetSourcemapLines(sourceMeta.maps, offsetLinesCount)
  const code = `${start}${sourceMeta.code}${end}`
  const newSourceMeta = { code, maps }
  return newSourceMeta
}
