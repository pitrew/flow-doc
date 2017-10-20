var fs = require('fs');
var flowDoc = require('../index.js')

if (process.argv.length < 5) {
	console.log('USAGE: [entry_point_path] [StartType] [file_suffix] (dest_file.html)');
} else {
	const html = flowDoc(process.argv[2], process.argv[3], process.argv[4]);
	fs.writeFileSync(argv[5] || 'index.html', html);
}





