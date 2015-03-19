'use strict';

importScripts('./bower_components/requirejs/require.js');

require(['require-config'], function() {
  require(['worker']);
})

