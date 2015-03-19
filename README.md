HTTP Live Streaming JavaScript player
=====================================
[![Gitter](https://badges.gitter.im/Join Chat.svg)](https://gitter.im/RReverser/mpegts?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)

What's this?
------------
This is [Apple HTTP Live Streaming](http://developer.apple.com/streaming/) JavaScript player created by
performing realtime conversion of MPEG-TS video chunks to MPEG-4 in separate thread using
Web Worker and playing them in order in main thread.

How does it work?
-----------------
Conversion is done using [jBinary](https://github.com/jDataView/jBinary) binary manipulation library with programmatically described data structures
according to ISO 13818-1, ISO-14496-2, ISO-14496-12 and ITU-T H.222.0 specifications.

Where does it work?
-------------------
Works best in Chrome (stable branch), having more noticable lags when switching videos
but still working in latest Firefox versions and IE10+.

Where I can see that?
---------------------
Check out [http://rreverser.github.io/mpegts/](http://rreverser.github.io/mpegts/) for live demo.

Screenshot:
[![Screenshot](http://rreverser.github.io/mpegts/screenshot.png?)](http://rreverser.github.io/mpegts/)

Disclaimer
----------
Please note that demo uses 3rd-party HLS demo source and service [http://www.corsproxy.com/](http://www.corsproxy.com/) for proxying it with
needed Cross-Origin-Request headers for browsers to allow chunk downloading, so it may be unstable.

Can I use it in Node.js?
------------------------
[Yes, you can.](NODE.md)

What license is it issued under?
--------------------------------
It's regular [MIT license](MIT-license.txt).

Running locally and building as a library
--------------------------------
* Install development dependencies using `npm install`
* Install runtime dependencies using `bower install`
* Build the the library and open the demo by simply running `gulp`
* For an example of using the library, see index-lib.html
