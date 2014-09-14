Usage in Node.js
================

Node.js version can be used for conversion of standalone `.ts` files to `.mp4`.

Using as executable
-------------------

```bash
npm i -g mpegts_to_mp4
mpegts_to_mp4 src.ts dest.mp4
```

Using as module
---------------

```bash
npm i --save mpegts_to_mp4
```

```javascript
var mpegts_to_mp4 = require('mpegts_to_mp4');

mpegts_to_mp4('src.ts', 'dest.mp4', function (err) {
	// ... handle success/error ...
});
// or
var promise = mpegts_to_mp4('src.ts', 'dest.mp4');
promise.then(
	function () { /* handle success */ },
	function (err) { /* handle error */ }
);
```

Both source and destination can be either string paths or Readable/Writable streams.