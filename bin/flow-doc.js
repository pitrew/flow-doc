var fs = require('fs');
var path = require('path');
var ncp = require('ncp').ncp;


var flowDoc = require('../index.js').default;

if (process.argv.length < 5) {
	console.log('USAGE: [entry_point_path] [StartType] [file_suffix] (dest_folder)');
} else {
	const html = flowDoc(process.argv[2], process.argv[3], process.argv[4]);
	

	var dir = process.argv[5] || 'dist';

	if (!fs.existsSync(dir)){
   		fs.mkdirSync(dir);
	}
	fs.writeFileSync(path.join(dir, 'index.html'), html);
	
	ncp.limit = 16;
 
	ncp(path.join(__dirname, '..', 'assets'), path.join(dir, 'assets'), function (err) {
		if (err) {
			return console.error(err);
		}
		console.log('done!');
	});

	
}





