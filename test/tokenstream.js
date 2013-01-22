fs = require('fs');
n3 = require('n3');

var path = './tokenstream';
var file_paths = fs.readdirSync(path);
for (var file_index = 0; file_index < file_paths.length; file_index += 1)
{
	var file_path = file_paths[file_index];
	var ds = fs.createReadStream(path + '/' + file_path);

	var ts = n3.createTokenStream();
	ts.on('error', function(exception) { console.log('FAILED << ' + this.file); });
	ts.on('end', function() { if (!this.errorEmitted) console.log('SUCCESS << ' + this.file); });

	ts.file = file_path;
	ds.pipe(ts);
}