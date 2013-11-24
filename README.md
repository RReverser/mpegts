HTTP Live Streaming JavaScript converter and player
======

This is [Apple HTTP Live Streaming](http://developer.apple.com/streaming/) JavaScript player created by
performing realtime conversion of MPEG-TS video chunks to MPEG-4 in parallel thread using
Web Worker and playing them one by one in main thread.

Conversion is done using [jBinary](https://github.com/jDataView/jBinary) library with programmatically described data structures
according to ISO 13818-*, ISO-14496-12 and ITU-T H.222.0 specifications.

Check out [http://rreverser.github.io/mpegts/](http://rreverser.github.io/mpegts/) for live demo.

Works best in Chrome (stable branch), having more noticable lags when switching videos
but still working in latest Firefox versions and IE10+.

Please note that demo uses 3rd-party HLS demo source and service [http://www.corsproxy.com/](http://www.corsproxy.com/) for proxying it with
needed Cross-Origin-Request headers for browsers to allow chunk downloading, so it may be unstable.
