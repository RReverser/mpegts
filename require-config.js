require.config({
  paths: {
    jdataview: './bower_components/jdataview/dist/browser/jdataview',
    jbinary: './bower_components/jbinary/dist/browser/jbinary',
    async: './bower_components/async/lib/async',
    consoleTime: './shim/console.time',
    consoleWorker: './shim/console.worker',
    worker: './worker'
  },
  shim: {
    consoleTime: {
      deps: ['consoleWorker'],
      exports: 'console'
    },
    consoleWorker: {
      deps: [],
      exports: 'console'
    }
  }
});