var qs = require('./lib/quadstream.js');
module.exports.createQuadStream = function(debug_stream)
{
	return new qs.QuadStream(debug_stream);
};

var ts = require('./lib/tokenstream.js');
module.exports.createTokenStream = function(debug_stream)
{
	return new ts.TokenStream(debug_stream);
};

